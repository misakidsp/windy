//! A scoped progress reporter for synchronous workers. The scope is installed
//! inside spawn_blocking, so reused pool threads never inherit another job.
use serde::Serialize;
use std::{
    cell::RefCell,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ActivityProgress {
    job_id: String,
    phase: &'static str,
    current: String,
    items: usize,
    total: Option<usize>,
    bytes: u64,
}

struct Reporter {
    progress: ActivityProgress,
    last_emit: Option<Instant>,
    emit: Box<dyn Fn(ActivityProgress)>,
}

thread_local! { static REPORTER: RefCell<Option<Reporter>> = const { RefCell::new(None) }; }
pub(crate) struct Scope(Option<Reporter>);
impl Drop for Scope {
    fn drop(&mut self) {
        REPORTER.with(|slot| *slot.borrow_mut() = self.0.take());
    }
}

pub(crate) fn begin(app: AppHandle, job_id: Option<String>, total: Option<usize>) -> Scope {
    install(
        job_id,
        total,
        Box::new(move |progress| {
            let _ = app.emit("activity-progress", progress);
        }),
    )
}

fn install(
    job_id: Option<String>,
    total: Option<usize>,
    emit: Box<dyn Fn(ActivityProgress)>,
) -> Scope {
    let reporter = job_id.map(|job_id| Reporter {
        progress: ActivityProgress {
            job_id,
            phase: "processing",
            current: String::new(),
            items: 0,
            total,
            bytes: 0,
        },
        last_emit: None,
        emit,
    });
    Scope(REPORTER.with(|slot| slot.replace(reporter)))
}

fn update(change: impl FnOnce(&mut ActivityProgress)) {
    REPORTER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(reporter) = slot.as_mut() else {
            return;
        };
        change(&mut reporter.progress);
        if reporter
            .last_emit
            .is_none_or(|time| time.elapsed() >= Duration::from_millis(100))
        {
            (reporter.emit)(reporter.progress.clone());
            reporter.last_emit = Some(Instant::now());
        }
    });
}

pub(crate) fn target(index: usize, path: &str) {
    update(|progress| {
        progress.items = index;
        progress.current = path.to_owned();
    });
}
pub(crate) fn scan(path: &std::path::Path) {
    update(|progress| {
        progress.phase = "scanning";
        progress.items += 1;
        progress.current = path.to_string_lossy().into_owned();
    });
}
pub(crate) fn bytes(count: usize, hashing: bool) {
    update(|progress| {
        if hashing {
            progress.phase = "hashing";
        }
        progress.bytes = progress.bytes.saturating_add(count as u64);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    #[test]
    fn reporter_is_scoped_and_throttled() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let capture = Arc::clone(&events);
        {
            let _scope = install(
                Some("job".into()),
                Some(4),
                Box::new(move |event| capture.lock().unwrap().push(event)),
            );
            target(1, "first");
            bytes(1024, false);
            target(2, "second");
            assert_eq!(events.lock().unwrap().len(), 1);
            REPORTER.with(|slot| {
                let slot = slot.borrow();
                let p = &slot.as_ref().unwrap().progress;
                assert_eq!(p.bytes, 1024);
                assert_eq!(p.items, 2);
            });
        }
        target(3, "outside");
        assert_eq!(events.lock().unwrap().len(), 1);
        REPORTER.with(|slot| assert!(slot.borrow().is_none()));
    }
}
