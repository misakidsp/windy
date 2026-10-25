import assert from "node:assert/strict";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { recoverySnapshot, historyLimit } from "../src/routes/recoveryModel";
import { createWorkspaceState } from "../src/routes/workspace/workspaceState.svelte";
import { createOperationsController } from "../src/routes/workspace/operationsController";
import { operationResultItemMessage } from "../src/routes/operationResultModel";
import type { RecoveryRecord } from "../src/routes/types";

assert.equal(historyLimit(undefined),20);
assert.equal(historyLimit(NaN),20);
assert.equal(historyLimit(0),1);
assert.equal(historyLimit(1001),1000);
const previousWindow=Object.getOwnPropertyDescriptor(globalThis,"window");
Object.defineProperty(globalThis,"window",{configurable:true,value:{}});
const record: RecoveryRecord={id:"op-1",kind:"copy",state:"applied",createdAt:1,bytes:0,items:[{beforePath:null,afterPath:"/work/new",state:"applied"}]};
let records=[record];let issues:{messageId:string;path:string}[]=[];let executions=0;
const state=createWorkspaceState();
state.settings.appSettings.operationResult.saveFailureLog=false;
const actions=createOperationsController(state,{
  focusActivePaneAfterDialog(){},localizedBackendError:String,queueCursorScroll(){},async reloadPanesAfterOperation(){},
  updatePane(id,patch){state.panes.panes[id]={...state.panes.panes[id],...patch};},visibleEntries:p=>p.entries,visibleLoadedEntries:(_id,e)=>e,
});
mockIPC((command,payload)=>{
  if(command==="recovery_history")return {records,issues:[{path:"/journal/broken.json",messageId:"recovery.invalidRecord",detail:"invalid JSON"}]};
  if(command==="recovery_plan")return {record,issues,paths:["/work/new → retained"]};
  assert.equal(command,"execute_file_operation_job");executions++;
  const job=(payload as {job:{recoveryId:string;recoveryDirection:string}}).job;
  assert.equal(job.recoveryId,record.id);
  record.state=job.recoveryDirection==="undo"?"undone":"applied";
  return {succeeded:[{path:"/work/new",message:"recovery.restored"}],failed:[],recoveryId:record.id,recoveryStatus:record.state};
});
const settled=()=>new Promise(resolve=>setTimeout(resolve,0));
try {
  await actions.loadRecoveryHistory();assert.equal(state.operations.undoStack.length,1);
  const snapshot=recoverySnapshot(record,state.settings.t);assert.equal(snapshot.job.recoveryDirection,"undo");assert.equal(snapshot.redoJob.recoveryDirection,"redo");
  actions.previewUndoOperation();await settled();
  assert.equal(state.operations.operationJob?.executable,true);assert.deepEqual(state.operations.operationJob?.plannedActions,["/work/new → retained"]);
  await actions.confirmOperationExecution();assert.equal(state.operations.undoStack.length,0);assert.equal(state.operations.redoStack.length,1);
  issues=[{messageId:"recovery.destinationExists",path:"/work/new"}];
  actions.previewRedoOperation();await settled();assert.equal(state.operations.operationJob?.executable,false);
  await actions.confirmOperationExecution();assert.equal(executions,1,"blocked recovery never invokes a file operation");
  actions.closeOperationPreview();issues=[];
  actions.previewRedoOperation();await settled();await actions.confirmOperationExecution();assert.equal(executions,2);assert.equal(state.operations.undoStack.length,1);
  assert.notEqual(operationResultItemMessage({path:"",message:"recovery.restored"}),"recovery.restored");
  records=[];await actions.loadRecoveryHistory();assert.equal(state.operations.undoStack.length,0,"removed records disappear from automatic history");
} finally {clearMocks();if(previousWindow)Object.defineProperty(globalThis,"window",previousWindow);else Reflect.deleteProperty(globalThis,"window");}
