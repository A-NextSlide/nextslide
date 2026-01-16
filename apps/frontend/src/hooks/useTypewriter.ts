import { useState, useEffect } from 'react';

interface UseTypewriterProps {
    phrases: string[];
    typingSpeed?: number;
    deletingSpeed?: number;
    pauseDuration?: number;
    paused?: boolean;
}

export const useTypewriter = ({
    phrases,
    typingSpeed = 50,
    deletingSpeed = 30,
    pauseDuration = 2000,
    paused = false
}: UseTypewriterProps) => {
    const [text, setText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);

    useEffect(() => {
        // Don't run when paused
        if (paused) return;

        const currentPhrase = phrases[phraseIndex];

        const timeout = setTimeout(() => {
            if (!isDeleting) {
                // Typing phase
                if (charIndex < currentPhrase.length) {
                    const char = currentPhrase[charIndex];
                    if (char === '\b') {
                        setText(prev => prev.slice(0, -1));
                    } else {
                        setText(prev => prev + char);
                    }
                    setCharIndex(prev => prev + 1);
                } else {
                    // Finished typing the raw phrase
                    setTimeout(() => setIsDeleting(true), pauseDuration);
                }
            } else {
                // Deleting phase
                if (text.length > 0) {
                    setText(prev => prev.slice(0, -1));
                } else {
                    // Finished deleting
                    setIsDeleting(false);
                    setPhraseIndex((prev) => (prev + 1) % phrases.length);
                    setCharIndex(0);
                }
            }
        }, isDeleting ? deletingSpeed : typingSpeed);

        return () => clearTimeout(timeout);
    }, [text, isDeleting, phraseIndex, charIndex, phrases, typingSpeed, deletingSpeed, pauseDuration, paused]);

    return text;
};
