import React from 'react';
import { cn } from '@/lib/utils';

const LogoMarquee: React.FC = () => {
    const logos = [
        "Acme Corp", "GlobalTech", "Nebula", "Trio", "FoxRun", "Circle", "Bolt", "Nirvana"
    ];

    return (
        <div className="w-full overflow-hidden bg-white dark:bg-black py-10 border-y border-black/5 dark:border-white/5">
            <div className="relative flex overflow-x-hidden group">
                <div className="animate-marquee whitespace-nowrap flex items-center gap-16 px-8">
                    {[...logos, ...logos, ...logos].map((logo, i) => (
                        <span
                            key={i}
                            className="text-2xl font-bold text-black/20 dark:text-white/20 uppercase tracking-widest select-none"
                            style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                        >
                            {logo}
                        </span>
                    ))}
                </div>

                <div className="absolute top-0 animate-marquee2 whitespace-nowrap flex items-center gap-16 px-8">
                    {[...logos, ...logos, ...logos].map((logo, i) => (
                        <span
                            key={i}
                            className="text-2xl font-bold text-black/20 dark:text-white/20 uppercase tracking-widest select-none"
                            style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                        >
                            {logo}
                        </span>
                    ))}
                </div>
            </div>

            <style>{`
        .animate-marquee {
          animation: marquee 25s linear infinite;
        }
        .animate-marquee2 {
          animation: marquee2 25s linear infinite;
        }
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes marquee2 {
          0% { transform: translateX(100%); }
          100% { transform: translateX(0%); }
        }
      `}</style>
        </div>
    );
};

export default LogoMarquee;
