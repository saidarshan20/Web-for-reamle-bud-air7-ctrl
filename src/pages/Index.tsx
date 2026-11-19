import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSerial } from '@/hooks/useSerial';
import { LandingHero } from '@/components/LandingHero';
import { HeaderBar } from '@/components/HeaderBar';
import { DashboardBuds } from '@/components/DashboardBuds';
import { NoiseControlCard } from '@/components/NoiseControlCard';
import { EQPresetCard } from '@/components/EQPresetCard';
import { SystemFeaturesCard } from '@/components/SystemFeaturesCard';
import { DynamicBassCard } from '@/components/DynamicBassCard';
import { CustomEQCard } from '@/components/CustomEQCard';
import { TouchControlsCard } from '@/components/TouchControlsCard';
import { SerialLog } from '@/components/SerialLog';
import { ConnectionOverlay } from '@/components/ConnectionOverlay';
import { InteractiveBackground } from '@/components/InteractiveBackground';

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      type: 'spring',
      stiffness: 220,
      damping: 22,
    },
  }),
};

const Index = () => {
  const {
    state,
    logs,
    connect,
    setANC,
    setANCStrength,
    setEQ,
    setVolEnhancer,
    setSys,
    setDynamicBassIntensity,
    saveNamedCustomEQ,
    selectCustomEQ,
    deleteCustomEQ,
    applyTouch,
  } = useSerial();

  const [showFlyOut, setShowFlyOut] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const handleConnect = useCallback(async () => {
    // Start actual connection
    const success = await connect();

    if (success) {
      setShowFlyOut(true);
      
      // After fly-out animation, show dashboard
      setTimeout(() => {
        setShowDashboard(true);
      }, 1300);
    }
  }, [connect]);

  return (
    <div className={`min-h-screen transition-all duration-[600ms] ${state.connected ? 'theme-connected' : ''}`}>
      <InteractiveBackground />


      <AnimatePresence mode="wait">
        {!showDashboard ? (
          <motion.div
            key="landing"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <LandingHero
              onConnect={handleConnect}
              isConnecting={state.loading && !showFlyOut}
              showFlyOut={showFlyOut}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            className="relative z-10 pb-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <HeaderBar connected={state.connected} reconnecting={state.reconnecting} onConnect={handleConnect} deviceName={state.deviceName} battery={state.battery} />

            {/* Reactive floating earbuds */}
            <DashboardBuds state={state} />

            <div className="w-full max-w-[960px] mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="contents md:flex md:flex-col md:gap-5">
                <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible" className="order-0">
                  <NoiseControlCard ancMode={state.ancMode} ancStrength={state.ancStrength} onSetANC={setANC} onSetStrength={setANCStrength} disabled={!state.connected || state.loading || state.busy || !state.air7 || !state.ancReady} />
                </motion.div>

                <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible" className="order-2 md:flex md:flex-1">
                  <SystemFeaturesCard
                    disabled={!state.connected || state.loading || state.busy || !state.air7}
                    features={state.features}
                    volEnhancerOn={state.volEnhancer}
                    onSetSys={setSys}
                    onSetVolEnhancer={setVolEnhancer}
                  />
                </motion.div>

              </div>
              <div className="contents md:flex md:flex-col md:gap-5">
                <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible" className="order-1">
                  <EQPresetCard disabled={!state.connected || state.loading || state.busy || !state.air7 || !state.eqReady} eqPreset={state.eqPreset} onSetEQ={setEQ} />
                </motion.div>

                <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible" className="order-3 md:flex md:flex-1">
                  <DynamicBassCard
                    disabled={!state.connected || state.loading || state.busy || !state.air7}
                    bassReady={state.bassReady}
                    features={state.features}
                    bassIntensity={state.bassIntensity}
                    onSetSys={setSys}
                    onSetBassIntensity={setDynamicBassIntensity}
                  />
                </motion.div>

              </div>

              <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible" className="order-4 md:col-span-2">
                <CustomEQCard key={String(state.connected)} disabled={!state.connected || state.loading || state.busy || !state.air7 || !state.eqReady} ready={state.customEQReady} presets={state.customPresets} activePreset={state.eqPreset} onSavePreset={saveNamedCustomEQ} onSelectPreset={selectCustomEQ} onDeletePreset={deleteCustomEQ} />
              </motion.div>

              <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible" className="order-5 md:col-span-2">
                <TouchControlsCard key={String(state.connected)} disabled={!state.connected || state.loading || state.busy || !state.air7} touch={state.touch} onApplyTouch={applyTouch} />
              </motion.div>
            </div>

            <SerialLog logs={logs} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
