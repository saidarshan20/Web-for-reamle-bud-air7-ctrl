import { motion } from 'framer-motion';
import { Music, Music2, Drum, Waves } from 'lucide-react';

interface EQPresetCardProps {
  eqPreset: number;
  disabled: boolean;
  onSetEQ: (val: number) => void;
}

const presets = [
  { label: 'Serenade', value: 2, icon: Music },
  { label: 'Original sound', value: 0, icon: Music2 },
  { label: 'Deep Bass', value: 1, icon: Drum },
  { label: 'Clear Bass', value: 3, icon: Waves },
];

export function EQPresetCard({ eqPreset, onSetEQ, disabled }: EQPresetCardProps) {
  return (
    <motion.div
      className="nm-raised rounded-[1.5rem] p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.05 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="nm-inset w-7 h-7 rounded-xl flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-primary" style={{ boxShadow: '0 0 6px hsl(var(--primary))' }} />
        </div>
        <h2 className="font-mono text-[0.65rem] font-bold tracking-[2px] uppercase text-muted-foreground">
          EQ mode
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {presets.map((p) => {
          const isActive = eqPreset === p.value;
          const Icon = p.icon;
          return (
            <motion.button
              key={p.value}
              id={`eq-preset-${p.value}`}
              onClick={() => onSetEQ(p.value)}
              disabled={disabled}
              className={`relative min-w-0 flex items-center gap-2 pl-3 pr-6 py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 disabled:opacity-50 ${
                isActive ? 'text-primary-foreground' : 'text-muted-foreground'
              }`}
              style={
                isActive
                  ? {
                      background: 'hsl(var(--primary))',
                      boxShadow:
                        'inset 2px 2px 6px hsl(var(--nm-accent-hsl) / 0.25), 0 0 22px var(--nm-glow-strong)',
                    }
                  : {
                      background: 'hsl(var(--nm-base))',
                      boxShadow:
                        '4px 4px 10px var(--nm-shadow-dark), -4px -4px 10px var(--nm-shadow-light)',
                    }
              }
              whileHover={isActive ? {} : { scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="min-w-0 text-left">{p.label}</span>
              {isActive && (
                <motion.div
                  layoutId="eq-check"
                  className="absolute right-3 w-2 h-2 rounded-full bg-primary-foreground"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
