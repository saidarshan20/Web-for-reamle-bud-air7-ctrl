import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TouchControlsCard } from '@/components/TouchControlsCard';
import type { TouchState } from '@/hooks/useSerial';

it('never invents a hold default and follows late device reports without overwriting edits', async()=>{
  Element.prototype.scrollIntoView=vi.fn();
  const onApply=vi.fn(async()=>true);
  const touch:TouchState={leftDouble:null,leftTriple:null,leftHold:null,rightDouble:null,rightTriple:null,rightHold:null};
  const view=render(<TouchControlsCard touch={touch} disabled={false} onApplyTouch={onApply}/>);
  expect(screen.getAllByLabelText('Touch and hold')[0]).toHaveTextContent('Not reported');
  expect(screen.getAllByLabelText('Touch and hold')[0]).toBeDisabled();
  const loaded={leftDouble:1,leftTriple:6,leftHold:8,rightDouble:1,rightTriple:6,rightHold:8};
  view.rerender(<TouchControlsCard touch={loaded} disabled={false} onApplyTouch={onApply}/>);
  expect(screen.getAllByLabelText('Touch and hold')[0]).toHaveTextContent('Switch noise control modes');
  fireEvent.keyDown(screen.getAllByLabelText('Touch and hold')[0],{key:'ArrowDown'});
  fireEvent.click(screen.getByRole('option',{name:'Voice Assistant'}));
  view.rerender(<TouchControlsCard touch={{...loaded,leftDouble:6}} disabled={false} onApplyTouch={onApply}/>);
  expect(screen.getAllByLabelText('Double-tap')[0]).toHaveTextContent('Next Track');
  expect(screen.getAllByLabelText('Touch and hold')[0]).toHaveTextContent('Voice Assistant');
  fireEvent.click(screen.getByRole('button',{name:'Apply Left'}));
  await waitFor(()=>expect(onApply).toHaveBeenCalledWith(1,{4:3}));
});
