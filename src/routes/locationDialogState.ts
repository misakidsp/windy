import { createEmptySftpForm } from "./forms";
import { sftpFormFromProfile } from "./locationManagerModel";
import type {
  LocalFavoriteProfile,
  LocationDialogMode,
  PendingKnownHost,
  SearchProfile,
  SftpConnectionForm,
  SftpConnectionProfile,
  SftpConnectionTestResult,
} from "./types";

export type LocationDialogState = {
  sftpDialogOpen: boolean;
  locationDialogMode: LocationDialogMode;
  locationCursorIndex: number;
  sftpConnecting: boolean;
  sftpConnectionError: string;
  sftpConnectionResult: SftpConnectionTestResult | null;
  pendingKnownHost: PendingKnownHost | null;
  pendingDeleteProfile: SftpConnectionProfile | null;
  pendingDeleteLocalFavorite: LocalFavoriteProfile | null;
  pendingDeleteSearchProfile: SearchProfile | null;
  sftpForm: SftpConnectionForm;
  imeComposing: boolean;
};

export type LocationDialogStatePatch = Partial<LocationDialogState>;

export function openManagerState(): LocationDialogStatePatch {
  return {
    sftpDialogOpen: true,
    locationDialogMode: "manager",
    locationCursorIndex: 0,
    sftpConnecting: false,
    sftpConnectionError: "",
    sftpConnectionResult: null,
    pendingKnownHost: null,
    ...clearPendingDeletesState(),
  };
}

export function closeManagerState(form: SftpConnectionForm): LocationDialogStatePatch {
  return {
    sftpDialogOpen: false,
    sftpConnecting: false,
    sftpConnectionError: "",
    pendingKnownHost: null,
    sftpForm: clearSftpSecrets(form),
    imeComposing: false,
    ...clearPendingDeletesState(),
  };
}

export function openNewSftpFormState(): LocationDialogStatePatch {
  return {
    sftpForm: createEmptySftpForm(),
    locationDialogMode: "sftpForm",
    sftpConnectionError: "",
    sftpConnectionResult: null,
    pendingKnownHost: null,
    imeComposing: false,
    ...clearPendingDeletesState(),
  };
}

export function openSftpProfileFormState(profile: SftpConnectionProfile): LocationDialogStatePatch {
  return {
    sftpForm: sftpFormFromProfile(profile),
    locationDialogMode: "sftpForm",
    sftpConnectionError: "",
    sftpConnectionResult: null,
    pendingKnownHost: null,
    imeComposing: false,
    ...clearPendingDeletesState(),
  };
}

export function returnToManagerState(form: SftpConnectionForm): LocationDialogStatePatch {
  return {
    sftpConnectionError: "",
    pendingKnownHost: null,
    sftpForm: clearSftpSecrets(form),
    locationDialogMode: "manager",
    imeComposing: false,
    ...clearPendingDeletesState(),
  };
}

export function patchSftpFormState(form: SftpConnectionForm, patch: Partial<SftpConnectionForm>): LocationDialogStatePatch {
  return {
    sftpForm: {
      ...form,
      ...patch,
    },
    pendingKnownHost: null,
  };
}

export function patchSftpAuthKindState(
  form: SftpConnectionForm,
  authKind: SftpConnectionForm["authKind"],
): LocationDialogStatePatch {
  return {
    ...patchSftpFormState(form, {
      authKind,
      password: "",
      passphrase: "",
    }),
    imeComposing: false,
  };
}

export function clearSftpSecrets(form: SftpConnectionForm): SftpConnectionForm {
  return {
    ...form,
    password: "",
    passphrase: "",
  };
}

export function clearPendingDeletesState(): LocationDialogStatePatch {
  return {
    pendingDeleteProfile: null,
    pendingDeleteLocalFavorite: null,
    pendingDeleteSearchProfile: null,
  };
}

export function armDeleteSftpProfileState(profile: SftpConnectionProfile): LocationDialogStatePatch {
  return {
    pendingDeleteProfile: profile,
    pendingDeleteLocalFavorite: null,
    pendingDeleteSearchProfile: null,
  };
}

export function armDeleteLocalFavoriteState(favorite: LocalFavoriteProfile): LocationDialogStatePatch {
  return {
    pendingDeleteLocalFavorite: favorite,
    pendingDeleteProfile: null,
    pendingDeleteSearchProfile: null,
  };
}

export function armDeleteSearchProfileState(profile: SearchProfile): LocationDialogStatePatch {
  return {
    pendingDeleteSearchProfile: profile,
    pendingDeleteProfile: null,
    pendingDeleteLocalFavorite: null,
  };
}

export function beginSftpConnectState(trustHostKey: boolean): LocationDialogStatePatch {
  return {
    sftpConnecting: true,
    sftpConnectionError: trustHostKey ? "trusting host key..." : "",
    sftpConnectionResult: null,
    pendingKnownHost: trustHostKey ? undefined : null,
  };
}

export function acceptSftpConnectSuccessState(
  form: SftpConnectionForm,
  result: SftpConnectionTestResult,
): LocationDialogStatePatch {
  return {
    sftpDialogOpen: false,
    sftpConnectionResult: result,
    pendingKnownHost: null,
    sftpForm: clearSftpSecrets(form),
    imeComposing: false,
  };
}

export function acceptKnownHostPromptState(prompt: PendingKnownHost): LocationDialogStatePatch {
  return {
    pendingKnownHost: prompt,
    sftpConnectionError: "host key is not registered",
    imeComposing: false,
  };
}

export function rejectSftpConnectState(form: SftpConnectionForm, error: string): LocationDialogStatePatch {
  return {
    sftpForm: clearSftpSecrets(form),
    pendingKnownHost: null,
    sftpConnectionError: error,
    imeComposing: false,
  };
}

export function finishSftpConnectState(): LocationDialogStatePatch {
  return {
    sftpConnecting: false,
  };
}

export function cancelKnownHostState(): LocationDialogStatePatch {
  return {
    pendingKnownHost: null,
    sftpConnectionError: "host key trust canceled",
  };
}
