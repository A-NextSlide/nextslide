import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Clock, Frown, FileText, Sparkles, ChevronDown, Star } from 'lucide-react';
import { BROWSER } from '@/utils/browser';

const ComparisonSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const isMobile = BROWSER.isMobile;

  // Create a more distinct "lock" phase where Old Way stays visible longer
  const oldWayOpacity = useTransform(scrollYProgress, [0, 0.5, 0.65], [1, 1, 0]);
  const newWayOpacity = useTransform(scrollYProgress, [0.55, 0.7, 1], [0, 1, 1]);

  const oldWayScale = useTransform(scrollYProgress, [0, 0.5, 0.65], [1, 1, 0.9]);
  const newWayScale = useTransform(scrollYProgress, [0.55, 1], [0.95, 1]);

  return (
    // Balanced height to 200vh for a perfect "lock" feel without excessive scroll
    <div ref={containerRef} className="relative h-[200vh] bg-zinc-50 dark:bg-zinc-950">
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center">

        {/* Background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-100 via-zinc-50 to-zinc-200 dark:from-zinc-900 dark:via-zinc-950 dark:to-black opacity-50" />

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col items-center justify-center">

          {/* Header */}
          <div className="text-center mb-8 sm:mb-12 mt-4 sm:mt-6 relative h-24 w-full flex items-center justify-center">
            <motion.div style={{ opacity: oldWayOpacity, position: 'absolute' }}>
              <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-zinc-400 line-through decoration-zinc-500/50 decoration-4">
                The Old Way
              </h2>
              <p className="text-zinc-500/80 font-medium mt-2">Boring. Static. Dead. Painful.</p>
            </motion.div>

            <motion.div style={{ opacity: newWayOpacity, position: 'absolute' }}>
              <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-[#FF4301]">
                The New Way
              </h2>
              <p className="text-[#FF4301]/80 font-medium mt-2">Intelligent. Instant. Beautiful.</p>
            </motion.div>
          </div>

          {/* Main Visual Content */}
          {/* Height-driven layout: fixed height, width scales with aspect ratio */}
          {/* Reduced to 60vh to guarantee fit without cropping */}
          <div className="relative mx-auto h-[50vh] sm:h-[60vh] aspect-video w-auto max-w-full flex items-center justify-center">

            {/* OLD WAY VISUAL - Boring PPT Interface */}
            <motion.div
              style={{ opacity: oldWayOpacity, scale: oldWayScale }}
              className="absolute inset-0 bg-[#E8E8E8] rounded-xl border border-zinc-300 shadow-xl overflow-hidden flex flex-col"
            >
              {/* 90s style Windows Bar */}
              <div className="h-8 bg-[#CCCCCC] border-b border-white shadow-[inset_1px_1px_0_white,inset_-1px_-1px_0_#888] flex items-center px-2 justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-600 rounded-sm" />
                  <span className="text-xs font-bold text-black font-tahoma">Presentation1.ppt</span>
                </div>
              </div>

              {/* Toolbar */}
              <div className="h-24 bg-[#F0F0F0] border-b border-[#999] flex flex-col p-1 gap-1 shrink-0">
                <div className="flex gap-1">
                  {['File', 'Edit', 'View', 'Insert', 'Format', 'Tools', 'Slide Show'].map(m => (
                    <span key={m} className="text-xs px-2 py-0.5 hover:bg-[#DDD] cursor-default text-black">{m}</span>
                  ))}
                </div>
                <div className="flex-1 bg-white border border-[#999] shadow-[inset_1px_1px_2px_#CCC] m-1" />
              </div>

              <div className="flex-1 flex bg-[#808080] p-4 gap-4 overflow-hidden min-h-0">
                {/* Sidebar */}
                <div className="w-32 bg-white border border-black shadow-[2px_2px_0_black] p-2 flex flex-col gap-2 opacity-50 shrink-0">
                  <div className="w-full h-20 border border-dotted border-black bg-white" />
                  <div className="w-full h-20 border border-black bg-white" />
                  <div className="w-full h-20 border border-black bg-white" />
                </div>

                {/* Main Canvas */}
                <div className="flex-1 bg-white border border-black shadow-[4px_4px_0_black] p-12 flex flex-col items-center justify-center relative min-w-0">
                  <div className="border border-dotted border-zinc-300 p-8 w-3/4 text-center cursor-text hover:bg-zinc-50">
                    <h3 className="text-4xl font-serif text-black mb-4">Click to add title</h3>
                  </div>
                  <div className="border border-dotted border-zinc-300 p-4 w-3/4 h-32 text-center mt-8 cursor-text hover:bg-zinc-50">
                    <p className="text-xl font-serif text-zinc-400">Click to add subtitle</p>
                  </div>

                  {/* Clipart / Boring elements */}
                  <div className="absolute top-4 right-4 text-xs font-serif text-zinc-300">Confidential</div>
                  <div className="absolute bottom-4 left-4 text-xs font-serif text-zinc-300">CONFIDENTIAL DRAFT</div>
                </div>
              </div>
            </motion.div>

            {/* NEW WAY VISUAL - ANIMATED BENTO GRID */}
            <motion.div
              style={{ opacity: newWayOpacity, scale: newWayScale }}
              className="absolute inset-0 bg-[#FCFBF8] dark:bg-[#0a0a0a] rounded-3xl shadow-2xl shadow-orange-500/20 border-4 border-[#FF4301]/10 flex flex-col overflow-hidden"
            >
              {/* Browser Bar - Simplified */}
              <div className="bg-white dark:bg-zinc-900 border-b border-black/5 h-8 flex items-center px-4 gap-2 shrink-0">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                </div>
                <div className="flex-1 text-center text-[10px] text-zinc-400 font-mono">nextslide.ai/magic</div>
              </div>

              {/* Main Slide Content */}
              <div className="flex-1 p-6 md:p-8 flex flex-col items-center justify-center relative overflow-hidden min-h-0">
                {/* Background Grid - subtle */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:24px_24px]" />

                {/* Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/30 text-[#FF4301] text-[10px] font-bold uppercase tracking-wider mb-6 border border-[#FF4301]/20 shadow-sm"
                >
                  <Sparkles size={12} className="animate-pulse" /> Generated in 90s
                </motion.div>

                {/* Headline */}
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl md:text-5xl font-black text-center mb-2 text-zinc-900 dark:text-zinc-100 tracking-tight"
                  style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                >
                  Your <span className="text-[#FF4301]">Pitch</span>, Perfected.
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-zinc-500 text-sm md:text-base mb-8 text-center max-w-md font-medium"
                >
                  Beautifully designed without lifting a finger.
                </motion.p>

                {/* Bento Grid */}
                <div className="grid grid-cols-3 gap-3 md:gap-4 w-full max-w-lg h-32 md:h-40">
                  {/* Card 1: Growth Chart */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="col-span-1 bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-100 dark:border-zinc-800 p-3 flex flex-col justify-end overflow-hidden relative group"
                  >
                    <div className="absolute top-2 left-3 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Growth</div>
                    <div className="flex items-end gap-1 h-3/4 w-full pt-4">
                      {[40, 65, 45, 85, 60, 95].map((h, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: 0 }}
                          whileInView={{ height: `${h}%` }}
                          transition={{ delay: 0.5 + (i * 0.1), duration: 0.8, type: "spring" }}
                          className="flex-1 bg-zinc-50 dark:bg-zinc-800 rounded-t-[1px]"
                        >
                          <div className={`w-full h-full bg-[#FF4301]`} style={{ opacity: 0.4 + (i * 0.1), borderRadius: '1px 1px 0 0' }} />
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Card 2: Visual */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    className="col-span-1 bg-gradient-to-br from-[#FF4301] to-[#FF8001] rounded-xl shadow-lg border border-[#FF4301]/20 p-3 flex flex-col text-white relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-white/10 mix-blend-overlay" />
                    <div className="relative z-10 mt-auto">
                      <div className="text-3xl font-black leading-none">A<span className="text-xl">+</span></div>
                      <div className="text-[8px] opacity-90 uppercase tracking-widest font-bold mt-1">Design Score</div>
                    </div>
                  </motion.div>

                  {/* Card 3: Qualitative Impact */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 }}
                    className="col-span-1 bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-100 dark:border-zinc-800 p-3 flex flex-col justify-center items-center relative overflow-hidden"
                  >
                    <div className="flex gap-1 mb-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0, rotate: -30 }}
                          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                          transition={{ delay: 0.7 + (i * 0.1), type: "spring" }}
                        >
                          <Star className="w-5 h-5 fill-[#FF4301] text-[#FF4301]" />
                        </motion.div>
                      ))}
                    </div>
                    <div className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      Impact
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>

          {!isMobile && (
            <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-400 font-bold opacity-70">Scroll to compare</span>
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="mt-3"
              >
                <ChevronDown className="mx-auto w-5 h-5 text-zinc-300" />
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ComparisonSection);
