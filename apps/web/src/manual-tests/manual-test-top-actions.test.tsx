// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ManualTestVerificationPanel } from './manual-test-verification-panel.js';
afterEach(cleanup);
async function open(status: Record<string, unknown>) {
  const callbacks = {onGenerate:vi.fn(), onReview:vi.fn(), onRecordResult:vi.fn()};
  const cases = [{id:'CASE-A', title:'Save', preconditions:[], steps:['Open example app'], expectedResult:'Saved', isReviewed:false}];
  render(<ManualTestVerificationPanel item={{id:'item',externalId:'EXAMPLE'} as never} workflow={{canGenerateManualTestPack:true} as never}
    isPending={false} isDisabled={false} {...callbacks} getArtifactUrl={vi.fn()}
    onFetchStatus={vi.fn().mockResolvedValue({status:{state:'current',currentPackId:'pack',currentReviewId:'review',manualCases:cases,...status}})} />);
  await waitFor(()=>expect(screen.getByRole('button').textContent).not.toContain('Loading'));
  fireEvent.click(screen.getByRole('button'));
  return callbacks;
}
it('places visible review and pass controls before the scrolling cases and explains incomplete generation',async()=>{
  const actions=await open({isStale:true, state:'stale', authoringProgress:{state:'paused',completedBatches:0,totalBatches:6,proposedCases:0,message:'Invalid first step'}});
  const toolbar=screen.getByRole('region',{name:'Pack actions'});
  const pass=within(toolbar).getByRole('button',{name:'All tests passed'}) as HTMLButtonElement;
  expect(pass.disabled).toBe(true);
  expect(toolbar.compareDocumentPosition(screen.getByText(/manual test cases —/)) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(screen.getByText(/Regeneration did not finish/)).toBeTruthy();
  fireEvent.click(pass);expect(actions.onRecordResult).not.toHaveBeenCalled();
  fireEvent.click(within(toolbar).getByRole('button',{name:'Regenerate test pack'}));
  await waitFor(()=>expect(actions.onGenerate).toHaveBeenCalled());
});
it('records all reviewed current manual cases even when automated coverage is unresolved',async()=>{
  const actions=await open({isReady:false,isReviewed:true,coverageIssues:['Automated coverage remains unassessed']});
  const pass=screen.getByRole('button',{name:'All tests passed'}) as HTMLButtonElement;
  expect(pass.disabled).toBe(false);fireEvent.click(pass);
  await waitFor(()=>expect(actions.onRecordResult).toHaveBeenCalledWith(expect.anything(),'pack','review',undefined,'pass',undefined,undefined));
});
it('requires review before enabling the all-pass action',async()=>{
  const actions=await open({isReady:false,isReviewed:false});
  expect((screen.getByRole('button',{name:'All tests passed'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'I reviewed this pack'}));
  await waitFor(()=>expect(actions.onReview).toHaveBeenCalledWith(expect.anything(),'pack'));
  expect(actions.onRecordResult).not.toHaveBeenCalled();
});
