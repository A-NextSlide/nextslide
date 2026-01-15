/**
 * Test page for mobile detection and thumbnail rendering
 * Access at /test-mobile
 */
import React, { useState, useEffect } from 'react';

// Synchronous mobile detection (same logic as MiniSlide)
const checkIsMobile = (): boolean => {
  if (typeof window === 'undefined') return true;

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isNarrowScreen = window.matchMedia('(max-width: 768px)').matches;
  const isShortScreen = window.matchMedia('(max-height: 500px)').matches;
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);

  return (isTouch && (isNarrowScreen || isShortScreen)) || isMobileUA;
};

export default function TestMobilePage() {
  const [mounted, setMounted] = useState(false);
  const [windowInfo, setWindowInfo] = useState<any>({});

  useEffect(() => {
    setMounted(true);

    const updateInfo = () => {
      setWindowInfo({
        width: window.innerWidth,
        height: window.innerHeight,
        isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        maxTouchPoints: navigator.maxTouchPoints,
        userAgent: navigator.userAgent,
        isNarrowScreen: window.matchMedia('(max-width: 768px)').matches,
        isShortScreen: window.matchMedia('(max-height: 500px)').matches,
        isMobileUA: /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(navigator.userAgent.toLowerCase()),
        checkIsMobileResult: checkIsMobile(),
      });
    };

    updateInfo();
    window.addEventListener('resize', updateInfo);
    return () => window.removeEventListener('resize', updateInfo);
  }, []);

  if (!mounted) {
    return <div className="p-4">Loading...</div>;
  }

  const isMobile = checkIsMobile();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Mobile Detection Test</h1>

      <div className={`p-4 rounded-lg mb-4 ${isMobile ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
        <p className="text-lg font-bold">
          Result: {isMobile ? 'MOBILE DETECTED' : 'DESKTOP DETECTED'}
        </p>
      </div>

      <div className="space-y-2 text-sm font-mono bg-gray-100 p-4 rounded">
        <p>Window Width: {windowInfo.width}px</p>
        <p>Window Height: {windowInfo.height}px</p>
        <p>Is Touch Device: {String(windowInfo.isTouch)}</p>
        <p>Max Touch Points: {windowInfo.maxTouchPoints}</p>
        <p>Is Narrow (&lt;768px): {String(windowInfo.isNarrowScreen)}</p>
        <p>Is Short (&lt;500px): {String(windowInfo.isShortScreen)}</p>
        <p>Is Mobile UA: {String(windowInfo.isMobileUA)}</p>
        <p className="break-all">User Agent: {windowInfo.userAgent}</p>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-bold mb-2">Test Thumbnails</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Simple colored boxes to simulate thumbnails */}
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-video rounded-lg flex items-center justify-center text-white font-bold"
              style={{
                background: `linear-gradient(135deg, hsl(${i * 60}, 70%, 50%), hsl(${i * 60 + 30}, 70%, 40%))`,
              }}
            >
              Thumbnail {i}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-sm text-gray-600">
        <p>If you're on mobile and see "DESKTOP DETECTED", the mobile detection is failing.</p>
        <p>Expected: Mobile devices should show "MOBILE DETECTED"</p>
      </div>
    </div>
  );
}
