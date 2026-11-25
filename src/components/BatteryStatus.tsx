import { Battery, BatteryCharging, BatteryLow, RefreshCw } from 'lucide-react';
import type { BatteryValues } from '@/lib/battery';

interface BatteryStatusProps {
  connected: boolean;
  battery: BatteryValues;
  charging: BatteryValues;
  refreshing: boolean;
  disabled: boolean;
  onRefresh: () => Promise<unknown>;
}

export function BatteryStatus({ connected, battery, charging, refreshing, disabled, onRefresh }: BatteryStatusProps) {
  return (
    <section aria-label="Battery levels" className="w-full max-w-[960px] mx-auto px-4 mb-6">
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-sm font-semibold text-foreground">Battery</p>
        <button
          type="button"
          aria-label="Refresh battery levels"
          aria-busy={refreshing}
          disabled={disabled || refreshing}
          onClick={() => { void onRefresh(); }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4" aria-live="polite" aria-atomic="true">
        {([['left', 'Left bud'], ['right', 'Right bud'], ['case', 'Case']] as const).map(([key, label]) => {
          const level = connected ? battery[key] : -1;
          const known = level > 0 && level <= 100;
          const isCharging = known && charging[key] === 1;
          const Icon = isCharging ? BatteryCharging : known && level <= 20 ? BatteryLow : Battery;
          const color = !known ? 'text-muted-foreground' : isCharging ? 'text-[hsl(var(--success))]' : level <= 20 ? 'text-destructive' : 'text-primary';
          return (
            <div key={key} role="group" aria-label={`${label} battery`} className="nm-raised rounded-2xl px-3 py-3 sm:px-5 sm:py-4 min-w-0">
              <p className="text-xs text-muted-foreground mb-2">{label}</p>
              <div className={`flex flex-wrap items-center gap-1.5 sm:gap-2 ${color}`}>
                <Icon aria-hidden="true" className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                <span className="text-xl sm:text-2xl font-semibold tabular-nums">{known ? `${level}%` : '—'}</span>
              </div>
              <div aria-hidden="true" className="nm-inset rounded-full h-1.5 mt-3 overflow-hidden">
                <div className={`h-full rounded-full transition-[width] duration-500 ${color} bg-current`} style={{ width: known ? `${level}%` : '0%' }} />
              </div>
              <p className="text-[0.65rem] sm:text-xs text-muted-foreground mt-2 min-h-4">
                {!connected ? 'Disconnected' : !known ? 'Not reported' : isCharging ? 'Charging' : 'Last reported'}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground mt-3">
        Open the case with at least one bud inside to read its battery. Levels update while connected, when the earbuds report them.
      </p>
    </section>
  );
}
