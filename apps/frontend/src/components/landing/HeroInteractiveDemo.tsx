import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Check, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const HeroInteractiveDemo: React.FC = () => {
    const [step, setStep] = useState(0);
    const [text, setText] = useState('');
    const fullText = "Q4 Sales Strategy for Enterprise Growth";

    useEffect(() => {
        let timeout: NodeJS.Timeout;

        if (step === 0) {
            // Typing animation
            if (text.length < fullText.length) {
                timeout = setTimeout(() => {
                    setText(fullText.slice(0, text.length + 1));
                }, 50);
            } else {
                timeout = setTimeout(() => setStep(1), 500);
            }
        } else if (step === 1) {
            // Generating state
            timeout = setTimeout(() => setStep(2), 1500);
        } else if (step === 2) {
            // Show result for a while then reset
            timeout = setTimeout(() => {
                setStep(0);
                setText('');
            }, 5000);
        }

        return () => clearTimeout(timeout);
    }, [step, text]);

    return (
        <div className="w-full max-w-2xl mx-auto bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            {/* Browser Chrome */}
            <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 flex items-center gap-2 border-b border-black/5 dark:border-white/5">
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="ml-4 flex-1 bg-white dark:bg-black/20 rounded-md h-6 w-full max-w-sm mx-auto" />
            </div>

            {/* Content Area */}
            <div className="p-8 min-h-[400px] flex flex-col items-center justify-center relative">
                <AnimatePresence mode="wait">
                    {step === 0 && (
                        <motion.div
                            key="input"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="w-full max-w-md"
                        >
                            <label className="block text-sm font-medium text-black/60 dark:text-white/60 mb-2">
                                What would you like to present?
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={text}
                                    readOnly
                                    className="w-full px-4 py-3 text-lg bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-[#FF4301] rounded-xl outline-none transition-all"
                                    placeholder="e.g. Q4 Marketing Plan..."
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <div className="w-2 h-5 bg-[#FF4301] animate-pulse" />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div
                            key="generating"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1 }}
                            className="flex flex-col items-center"
                        >
                            <div className="relative w-16 h-16 mb-6">
                                <div className="absolute inset-0 border-4 border-[#FF4301]/20 rounded-full" />
                                <div className="absolute inset-0 border-4 border-[#FF4301] rounded-full border-t-transparent animate-spin" />
                                <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-[#FF4301]" />
                            </div>
                            <p className="text-lg font-medium text-black/60 dark:text-white/60 animate-pulse">
                                Generating outline...
                            </p>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="result"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full h-full absolute inset-0 bg-white dark:bg-zinc-900 flex flex-col"
                        >
                            {/* Slide Header */}
                            <div className="p-8 pb-4">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF4301]/10 text-[#FF4301] text-xs font-bold mb-4">
                                    <Zap className="w-3 h-3" />
                                    GENERATED IN 1.2s
                                </div>
                                <h2 className="text-4xl font-bold text-black dark:text-white mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                                    Q4 Sales Strategy
                                </h2>
                                <p className="text-xl text-black/60 dark:text-white/60">
                                    Accelerating enterprise growth through strategic partnerships.
                                </p>
                            </div>

                            {/* Slide Content Grid */}
                            <div className="flex-1 p-8 pt-0 grid grid-cols-2 gap-4">
                                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-6 border border-black/5 dark:border-white/5">
                                    <h3 className="text-lg font-bold mb-4">Key Objectives</h3>
                                    <ul className="space-y-3">
                                        {[1, 2, 3].map((i) => (
                                            <li key={i} className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-green-600" />
                                                </div>
                                                <div className="h-2 bg-black/10 dark:bg-white/10 rounded w-full" />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-6 border border-black/5 dark:border-white/5 flex items-center justify-center">
                                    {/* Simple Chart Graphic */}
                                    <div className="flex items-end gap-2 h-32">
                                        <div className="w-8 bg-[#FF4301]/20 rounded-t-sm h-[40%]" />
                                        <div className="w-8 bg-[#FF4301]/40 rounded-t-sm h-[60%]" />
                                        <div className="w-8 bg-[#FF4301]/60 rounded-t-sm h-[50%]" />
                                        <div className="w-8 bg-[#FF4301] rounded-t-sm h-[80%]" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default HeroInteractiveDemo;
