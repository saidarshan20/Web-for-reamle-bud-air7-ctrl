import { motion } from 'framer-motion';
import { Shield, Headphones, Wind } from 'lucide-react';
import { ANC_STRENGTHS, isStrength } from '@/lib/air7';

interface NoiseControlCardProps {
  ancMode: number;
  onSetANC: (val: number) => void;
  ancStrength: number | null;
  disabled: boolean;
  onSetStrength: (val: number) => void;
}

const modes = [
  { label: 'Off', value: 1, icon: Wind },
  { label: 'Noise cancellation', value: 8, icon: Shield },
  { label: 'Transparency', value: 2, icon: Headphones },
];

export function NoiseControlCard({ ancMode, onSetANC, ancStrength, disabled, onSetStrength }: NoiseControlCardProps) {
  return (
    <motion.div
      className="nm-raised rounded-[1.5rem] p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="nm-inset w-7 h-7 rounded-xl flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-primary" style={{ boxShadow: '0 0 6px hsl(var(--primary))' }} />
        </div>
        <h2 className="font-mono text-[0.65rem] font-bold tracking-[2px] uppercase text-muted-foreground">
          Noise control
        </h2>
      </div>

      {/* Segment track */}
      <div className="nm-inset rounded-2xl p-1.5 flex gap-1">
        {modes.map((mode) => {
          const isActive = mode.value === 8 ? isStrength(ancMode) : ancMode === mode.value;
          const Icon = mode.icon;
          return (
            <motion.button
              key={mode.value}
              id={`anc-mode-${mode.value}`}
              onClick={() => onSetANC(mode.value)}
              disabled={disabled}
              aria-pressed={isActive}
              className={`relative min-w-0 flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs sm:text-sm font-medium z-10 transition-colors duration-200 disabled:opacity-50 ${
                isActive ? 'text-primary-foreground' : 'text-muted-foreground'
              }`}
              whileTap={{ scale: 0.96 }}
            >
              {isActive && (
                <motion.div
                  layoutId="anc-indicator"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: 'hsl(var(--primary))',
                    boxShadow: '0 0 18px var(--nm-glow-strong), inset 2px 2px 6px hsl(var(--nm-accent-hsl) / 0.3)',
                  }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex flex-col sm:flex-row items-center gap-1.5 text-center">
                <Icon className="w-4 h-4 shrink-0" />
                {mode.label}
              </span>
            </motion.button>
          );
        })}
      </div>
      <div className="mt-4">
        <h3 id="anc-strength-label" className="text-xs text-muted-foreground mb-2 font-medium">Noise cancellation strength</h3>
        <div role="group" aria-labelledby="anc-strength-label" className="nm-inset rounded-2xl p-1.5 flex gap-1">
          {ANC_STRENGTHS.map(strength => {
            const selected = ancStrength === strength.value;
            return <motion.button
              key={strength.value}
              id={`anc-strength-${strength.value}`}
              disabled={disabled || !isStrength(ancMode)}
              aria-pressed={selected}
              title={strength.description}
              onClick={() => onSetStrength(strength.value)}
              className={`relative min-w-0 flex-1 py-2.5 rounded-xl text-[0.65rem] sm:text-xs font-medium transition-colors duration-200 disabled:opacity-50 ${selected ? 'text-primary-foreground' : 'text-muted-foreground'}`}
              whileTap={{ scale: 0.96 }}
            >
              {selected && <motion.div layoutId="anc-strength-indicator" className="absolute inset-0 rounded-xl" style={{ background: 'hsl(var(--primary))', boxShadow: '0 0 18px var(--nm-glow-strong), inset 2px 2px 6px hsl(var(--nm-accent-hsl) / 0.3)' }} transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
              <span className="relative z-10">{strength.label}</span>
            </motion.button>;
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2 min-h-8" aria-live="polite">
          {disabled ? 'Waiting for confirmed device state.' : !isStrength(ancMode) ? 'Turn noise cancellation on to change strength.' : ANC_STRENGTHS.find(s => s.value === ancStrength)?.description ?? 'Strength not reported by earbuds.'}
        </p>
      </div>
    </motion.div>
  );
}
