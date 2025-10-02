import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Brain, Sparkles, Layers, Palette, ChevronRight } from 'lucide-react';

interface FileAnalysisLoaderProps {
  isVisible: boolean;
  currentFile?: string;
  fileProgress?: { current: number; total: number };
  stage?: string;
}

interface AnalysisStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  duration: number; // milliseconds
  subSteps?: string[];
}

const analysisSteps: AnalysisStep[] = [
  {
    id: 'reading',
    label: 'Reading file content',
    icon: <FileText className="w-4 h-4" />,
    duration: 2000,
    subSteps: [
      'Parsing document structure',
      'Extracting text content',
      'Identifying sections'
    ]
  },
  {
    id: 'understanding',
    label: 'Understanding context',
    icon: <Brain className="w-4 h-4" />,
    duration: 3000,
    subSteps: [
      'Analyzing main topics',
      'Identifying key points',
      'Understanding relationships'
    ]
  },
  {
    id: 'structuring',
    label: 'Planning presentation',
    icon: <Layers className="w-4 h-4" />,
    duration: 2500,
    subSteps: [
      'Creating logical flow',
      'Organizing content',
      'Determining slide count'
    ]
  },
  {
    id: 'designing',
    label: 'Designing visual style',
    icon: <Palette className="w-4 h-4" />,
    duration: 2000,
    subSteps: [
      'Selecting color palette',
      'Choosing typography',
      'Planning layouts'
    ]
  },
  {
    id: 'generating',
    label: 'Generating outline',
    icon: <Sparkles className="w-4 h-4" />,
    duration: 1500,
    subSteps: [
      'Creating slide titles',
      'Writing content points',
      'Finalizing structure'
    ]
  }
];

export const FileAnalysisLoader: React.FC<FileAnalysisLoaderProps> = ({
  isVisible,
  currentFile,
  fileProgress,
  stage
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [subStepIndex, setSubStepIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Progress through steps automatically
  useEffect(() => {
    if (!isVisible) {
      setCurrentStepIndex(0);
      setSubStepIndex(0);
      setElapsedTime(0);
      return;
    }

    const currentStep = analysisSteps[currentStepIndex];
    const subStepDuration = currentStep.duration / (currentStep.subSteps?.length || 1);

    // Stop timer if we're at the last step and completed
    const isLastStep = currentStepIndex === analysisSteps.length - 1;
    const isStepComplete = elapsedTime >= currentStep.duration;
    
    if (isLastStep && isStepComplete) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedTime(prev => {
        const newTime = prev + 100;
        // Cap elapsed time at the current step duration
        return Math.min(newTime, currentStep.duration);
      });

      // Progress sub-steps
      if (currentStep.subSteps && subStepIndex < currentStep.subSteps.length - 1) {
        const elapsed = elapsedTime % currentStep.duration;
        const expectedSubStep = Math.floor(elapsed / subStepDuration);
        if (expectedSubStep > subStepIndex) {
          setSubStepIndex(expectedSubStep);
        }
      }

      // Progress to next main step
      if (elapsedTime >= currentStep.duration - 100 && currentStepIndex < analysisSteps.length - 1) {
        setCurrentStepIndex(prev => prev + 1);
        setSubStepIndex(0);
        setElapsedTime(0);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [isVisible, currentStepIndex, subStepIndex, elapsedTime]);

  const currentStep = analysisSteps[currentStepIndex];
  const stepProgress = Math.min(elapsedTime / currentStep.duration, 1);
  const overallProgress = Math.min(((currentStepIndex + stepProgress) / analysisSteps.length) * 100, 100);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="w-full max-w-md mx-auto"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
            {/* File info */}
            {currentFile && (
              <div className="mb-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Analyzing file</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
                  {currentFile}
                </p>
                {fileProgress && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    File {fileProgress.current} of {fileProgress.total}
                  </p>
                )}
              </div>
            )}

            {/* Steps list */}
            <div className="space-y-3 mb-6">
              {analysisSteps.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isCompleted = index < currentStepIndex;
                const isUpcoming = index > currentStepIndex;

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon with status */}
                      <div className={`
                        flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300
                        ${isCompleted ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                          isActive ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                          'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600'}
                      `}>
                        {isCompleted ? (
                          <motion.svg
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </motion.svg>
                        ) : (
                          <div className={isActive ? 'animate-pulse' : ''}>
                            {step.icon}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={`
                          text-sm font-medium transition-colors duration-300
                          ${isCompleted ? 'text-zinc-600 dark:text-zinc-400' :
                            isActive ? 'text-zinc-900 dark:text-zinc-100' :
                            'text-zinc-400 dark:text-zinc-600'}
                        `}>
                          {step.label}
                        </p>

                        {/* Sub-steps for active step */}
                        <AnimatePresence>
                          {isActive && step.subSteps && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="mt-2 space-y-1 overflow-hidden"
                            >
                              {step.subSteps.map((subStep, subIndex) => (
                                <motion.div
                                  key={subIndex}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ 
                                    opacity: subIndex <= subStepIndex ? 1 : 0.3,
                                    x: 0 
                                  }}
                                  transition={{ delay: subIndex * 0.1 }}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  <ChevronRight className={`
                                    w-3 h-3 transition-colors duration-300
                                    ${subIndex <= subStepIndex ? 'text-orange-500' : 'text-zinc-400'}
                                  `} />
                                  <span className={`
                                    transition-colors duration-300
                                    ${subIndex <= subStepIndex ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-600'}
                                  `}>
                                    {subStep}
                                  </span>
                                </motion.div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="relative">
              <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${overallProgress}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {Math.round(overallProgress)}% complete
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">
                  Processing...
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FileAnalysisLoader; 