import { motion } from 'framer-motion';
import { useState } from 'react';
import type { TouchState } from '@/hooks/useSerial';
import { actionsFor, type Gesture } from '@/lib/air7';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface TouchControlsCardProps {
  touch: TouchState;
  disabled: boolean;
  onApplyTouch: (side: 1 | 2, changes: Partial<Record<Gesture, number>>) => Promise<boolean>;
}

function NmSelect({ value, onChange, id, gesture, disabled }: { value: number | null; onChange: (v: number) => void; id: string; gesture: Gesture; disabled: boolean }) {
  const actions = actionsFor(gesture);
  return (
    <Select
      value={value === null ? '' : String(value)}
      disabled={disabled}
      onValueChange={v => onChange(Number(v))}
    >
      <SelectTrigger id={id} className="nm-select h-auto min-h-[42px] w-full px-3 py-2.5 rounded-xl border-0 text-sm font-medium outline-none cursor-pointer focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder="Not reported" />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={6} className="theme-connected nm-raised z-[70] rounded-2xl border border-border/60 p-1 max-h-[min(340px,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)]">
        {value !== null && !actions.some(a => a.value === value) && <SelectItem value={String(value)} disabled>{`Detected action (0x${value.toString(16)})`}</SelectItem>}
        {actions.map(a => (
          <SelectItem key={a.value} value={String(a.value)} className="rounded-xl py-2.5 pr-3 font-medium cursor-pointer transition-colors data-[state=checked]:text-primary data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary focus:bg-primary/10 focus:text-primary">
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EarbudPanel({ title, side, initialDouble, initialTriple, initialHold, disabled, onApply }: {
  title: string;
  side: 1 | 2;
  initialDouble: number | null;
  initialTriple: number | null;
  initialHold: number | null;
  disabled: boolean;
  onApply: TouchControlsCardProps['onApplyTouch'];
}) {
  // Store edits only; unmodified fields always follow the latest device report.
  const [changes, setChanges] = useState<Partial<Record<Gesture, number>>>({});
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    setApplying(true);
    try { if (await onApply(side, changes)) setChanges({}); }
    finally { setApplying(false); }
  };

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'hsl(var(--nm-base))',
        boxShadow: 'inset 4px 4px 10px var(--nm-shadow-dark), inset -4px -4px 10px var(--nm-shadow-light)',
      }}
    >
      <h3 className="font-mono text-[0.62rem] font-bold tracking-[2px] uppercase text-primary mb-4">
        {title}
      </h3>

      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor={`touch-${side}-double`} className="text-xs text-muted-foreground mb-1.5 block font-medium">Double-tap</label>
          <NmSelect id={`touch-${side}-double`} gesture={2} disabled={disabled || applying || initialDouble === null} value={changes[2] ?? initialDouble} onChange={v => setChanges(c => ({...c, 2:v}))} />
        </div>
        <div>
          <label htmlFor={`touch-${side}-triple`} className="text-xs text-muted-foreground mb-1.5 block font-medium">Triple-tap</label>
          <NmSelect id={`touch-${side}-triple`} gesture={3} disabled={disabled || applying || initialTriple === null} value={changes[3] ?? initialTriple} onChange={v => setChanges(c => ({...c, 3:v}))} />
        </div>
        <div>
          <label htmlFor={`touch-${side}-hold`} className="text-xs text-muted-foreground mb-1.5 block font-medium">Touch and hold</label>
          <NmSelect id={`touch-${side}-hold`} gesture={4} disabled={disabled || applying || initialHold === null} value={changes[4] ?? initialHold} onChange={v => setChanges(c => ({...c, 4:v}))} />
        </div>

        <motion.button
          id={`apply-touch-${side}`}
          onClick={handleApply}
          disabled={disabled || applying || !Object.keys(changes).length}
          className="w-full py-2.5 rounded-xl text-primary text-sm font-semibold relative overflow-hidden disabled:opacity-50"
          style={{
            background: 'hsl(var(--nm-base))',
            boxShadow: '4px 4px 10px var(--nm-shadow-dark), -4px -4px 10px var(--nm-shadow-light)',
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          <motion.span
            className="absolute inset-0 rounded-xl"
            style={{ background: 'hsl(var(--primary) / 0.08)' }}
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
          />
          <span className="relative z-10">
            {applying ? (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              >
                Applying…
              </motion.span>
            ) : (
              `Apply ${side === 1 ? 'Left' : 'Right'}`
            )}
          </span>
        </motion.button>
      </div>
    </div>
  );
}

export function TouchControlsCard({ touch, disabled, onApplyTouch }: TouchControlsCardProps) {
  return (
    <motion.div
      className="nm-raised rounded-[1.5rem] p-5 col-span-1 md:col-span-2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.25 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="nm-inset w-7 h-7 rounded-xl flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-primary" style={{ boxShadow: '0 0 6px hsl(var(--primary))' }} />
        </div>
        <h2 className="font-mono text-[0.65rem] font-bold tracking-[2px] uppercase text-muted-foreground">
          Button settings
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <EarbudPanel
          title="Left earbud actions"
          side={1}
          initialDouble={touch.leftDouble}
          initialTriple={touch.leftTriple}
          initialHold={touch.leftHold}
          disabled={disabled}
          onApply={onApplyTouch}
        />
        <EarbudPanel
          title="Right earbud actions"
          side={2}
          initialDouble={touch.rightDouble}
          initialTriple={touch.rightTriple}
          initialHold={touch.rightHold}
          disabled={disabled}
          onApply={onApplyTouch}
        />
      </div>
    </motion.div>
  );
}
