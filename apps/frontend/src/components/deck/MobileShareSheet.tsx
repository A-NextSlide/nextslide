import React, { useState, useEffect, useCallback } from 'react';
import { nativeBridge } from '@/utils/nativeBridge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Link,
  Copy,
  Check,
  QrCode,
  Mail,
  Share2,
  Eye,
  Edit,
  Loader2,
  ExternalLink,
  MessageCircle,
  Twitter,
  Linkedin
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { shareService, ShareLink } from '@/services/shareService';
import { mockShareService } from '@/services/mockShareService';
import { trackDeckShared } from '@/services/analytics';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

interface MobileShareSheetProps {
  deckUuid: string;
  deckName: string;
}

const MobileShareSheet: React.FC<MobileShareSheetProps> = ({ deckUuid, deckName }) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [activeLink, setActiveLink] = useState<ShareLink | null>(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  // Listen for open event from mobile share button
  useEffect(() => {
    const handler = () => {
      setIsOpen(true);
      loadShareLinks();
    };
    window.addEventListener('open-deck-sharing', handler as EventListener);
    return () => window.removeEventListener('open-deck-sharing', handler as EventListener);
  }, []);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const loadShareLinks = async () => {
    setIsLoading(true);
    try {
      let response = await shareService.getShareLinks(deckUuid);
      if (!response.success && response.error?.includes('401')) {
        response = await mockShareService.getShareLinks(deckUuid);
      }
      if (response.success && response.data) {
        const links = Array.isArray(response.data) ? response.data : [];
        setShareLinks(links);
        // Set the first view link as active if exists
        const viewLink = links.find(l => l.share_type === 'view');
        if (viewLink) setActiveLink(viewLink);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateShareLink = async (shareType: 'view' | 'edit' = 'view') => {
    setIsCreatingLink(true);
    try {
      let response = await shareService.createShareLink(deckUuid, {
        share_type: shareType,
        expires_in_hours: undefined
      });

      if (!response.success && (response.error?.includes('422') || response.error?.includes('401'))) {
        response = await mockShareService.createShareLink(deckUuid, {
          share_type: shareType,
          expires_in_hours: undefined
        });
      }

      if (response.success && response.data) {
        trackDeckShared({ deckId: deckUuid, shareType: 'link' });
        const newLink = response.data;
        setShareLinks(prev => [newLink, ...prev]);
        setActiveLink(newLink);

        // Copy the link automatically
        const fullUrl = mockShareService.getShareUrl(newLink.short_code, shareType);
        await navigator.clipboard.writeText(fullUrl);

        toast({
          title: "Link created & copied",
          description: "Share link has been copied to clipboard",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create share link",
        variant: "destructive"
      });
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleCopyLink = async (link: ShareLink) => {
    const fullUrl = mockShareService.getShareUrl(link.short_code, link.share_type);
    await navigator.clipboard.writeText(fullUrl);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);

    toast({
      title: "Link copied",
      description: "Share link copied to clipboard",
    });
  };

  const handleNativeShare = async (link: ShareLink) => {
    const fullUrl = mockShareService.getShareUrl(link.short_code, link.share_type);

    if (navigator.share) {
      try {
        await navigator.share({
          title: deckName,
          text: `Check out my presentation: ${deckName}`,
          url: fullUrl,
        });
        trackDeckShared({ deckId: deckUuid, shareType: 'native' });
      } catch (err) {
        // User cancelled or error - silently ignore
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      // Fallback to copy
      await handleCopyLink(link);
    }
  };

  const handleShowQR = async (link: ShareLink) => {
    try {
      const fullUrl = mockShareService.getShareUrl(link.short_code, link.share_type);
      const qrDataUrl = await QRCode.toDataURL(fullUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
      setQrCodeUrl(qrDataUrl);
      setShowQR(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate QR code",
        variant: "destructive"
      });
    }
  };

  const handleSocialShare = (platform: 'twitter' | 'linkedin' | 'email', link: ShareLink) => {
    const fullUrl = mockShareService.getShareUrl(link.short_code, link.share_type);
    const encodedUrl = encodeURIComponent(fullUrl);
    const encodedText = encodeURIComponent(`Check out my presentation: ${deckName}`);

    let shareUrl = '';
    switch (platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case 'email':
        shareUrl = `mailto:?subject=${encodeURIComponent(deckName)}&body=${encodedText}%0A%0A${encodedUrl}`;
        break;
    }

    if (shareUrl) {
      nativeBridge.openExternal(shareUrl);
      trackDeckShared({ deckId: deckUuid, shareType: platform });
    }
  };

  const getOrCreateViewLink = useCallback(async () => {
    const viewLink = shareLinks.find(l => l.share_type === 'view');
    if (viewLink) return viewLink;

    // Create one if none exists
    await handleCreateShareLink('view');
    return shareLinks.find(l => l.share_type === 'view') || null;
  }, [shareLinks]);

  const hasViewLink = shareLinks.some(l => l.share_type === 'view');

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-[9999]"
            onClick={() => { setIsOpen(false); setShowQR(false); }}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[10000] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Share</h2>
                <p className="text-xs text-gray-500 truncate max-w-[200px]">{deckName}</p>
              </div>
              <button
                onClick={() => { setIsOpen(false); setShowQR(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 100px)' }}>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={28} className="animate-spin text-[#FF4301]" />
                </div>
              ) : showQR ? (
                /* QR Code View */
                <div className="p-6 flex flex-col items-center">
                  <button
                    onClick={() => setShowQR(false)}
                    className="self-start flex items-center gap-1 text-sm text-gray-500 mb-4"
                  >
                    <X size={14} /> Back
                  </button>

                  <div className="bg-white p-4 rounded-2xl shadow-lg border border-gray-200">
                    <img src={qrCodeUrl} alt="QR Code" className="w-56 h-56" />
                  </div>

                  <p className="text-sm text-gray-600 mt-4 text-center">
                    Scan to view presentation
                  </p>

                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = qrCodeUrl;
                      link.download = `${deckName.replace(/\s+/g, '-')}-qr.png`;
                      link.click();
                    }}
                    className="mt-4 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium"
                  >
                    Save QR Code
                  </button>
                </div>
              ) : (
                <>
                  {/* Quick Share Actions */}
                  <div className="p-5">
                    {!hasViewLink ? (
                      /* Create Link CTA */
                      <button
                        onClick={() => handleCreateShareLink('view')}
                        disabled={isCreatingLink}
                        className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-[#FF4301] to-[#FF6B00] text-white rounded-2xl font-semibold shadow-lg shadow-orange-200"
                      >
                        {isCreatingLink ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Link size={18} />
                        )}
                        {isCreatingLink ? 'Creating...' : 'Create Share Link'}
                      </button>
                    ) : (
                      /* Share Actions Grid */
                      <>
                        {/* Primary actions */}
                        <div className="grid grid-cols-4 gap-3 mb-5">
                          <button
                            onClick={() => activeLink && handleCopyLink(activeLink)}
                            disabled={!activeLink}
                            className="flex flex-col items-center gap-2 py-3"
                          >
                            <div className={cn(
                              "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
                              copiedId === activeLink?.id
                                ? "bg-green-100 text-green-600"
                                : "bg-gray-100 text-gray-700"
                            )}>
                              {copiedId === activeLink?.id ? (
                                <Check size={22} />
                              ) : (
                                <Copy size={22} />
                              )}
                            </div>
                            <span className="text-xs text-gray-600 font-medium">
                              {copiedId === activeLink?.id ? 'Copied!' : 'Copy'}
                            </span>
                          </button>

                          {navigator.share && (
                            <button
                              onClick={() => activeLink && handleNativeShare(activeLink)}
                              disabled={!activeLink}
                              className="flex flex-col items-center gap-2 py-3"
                            >
                              <div className="w-14 h-14 rounded-2xl bg-[#FF4301]/10 text-[#FF4301] flex items-center justify-center">
                                <Share2 size={22} />
                              </div>
                              <span className="text-xs text-gray-600 font-medium">Share</span>
                            </button>
                          )}

                          <button
                            onClick={() => activeLink && handleShowQR(activeLink)}
                            disabled={!activeLink}
                            className="flex flex-col items-center gap-2 py-3"
                          >
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center">
                              <QrCode size={22} />
                            </div>
                            <span className="text-xs text-gray-600 font-medium">QR Code</span>
                          </button>

                          <button
                            onClick={() => activeLink && handleSocialShare('email', activeLink)}
                            disabled={!activeLink}
                            className="flex flex-col items-center gap-2 py-3"
                          >
                            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                              <Mail size={22} />
                            </div>
                            <span className="text-xs text-gray-600 font-medium">Email</span>
                          </button>
                        </div>

                        {/* Social Share */}
                        <div className="flex items-center gap-2 mb-5">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs text-gray-400 px-2">or share via</span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>

                        <div className="flex justify-center gap-4 mb-5">
                          <button
                            onClick={() => activeLink && handleSocialShare('twitter', activeLink)}
                            disabled={!activeLink}
                            className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center"
                          >
                            <Twitter size={20} />
                          </button>
                          <button
                            onClick={() => activeLink && handleSocialShare('linkedin', activeLink)}
                            disabled={!activeLink}
                            className="w-12 h-12 rounded-full bg-[#0077B5] text-white flex items-center justify-center"
                          >
                            <Linkedin size={20} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Links List */}
                  {shareLinks.length > 0 && (
                    <div className="border-t border-gray-100">
                      <div className="px-5 py-3 flex items-center justify-between">
                        <h3 className="text-sm font-medium text-gray-700">Your Links</h3>
                        <button
                          onClick={() => handleCreateShareLink('view')}
                          disabled={isCreatingLink}
                          className="text-xs text-[#FF4301] font-medium"
                        >
                          + New Link
                        </button>
                      </div>

                      <div className="px-5 pb-5 space-y-2">
                        {shareLinks.slice(0, 5).map((link) => (
                          <div
                            key={link.id}
                            onClick={() => setActiveLink(link)}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-xl border transition-all",
                              activeLink?.id === link.id
                                ? "border-[#FF4301] bg-[#FF4301]/5"
                                : "border-gray-200 bg-white"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-9 h-9 rounded-lg flex items-center justify-center",
                                link.share_type === 'view'
                                  ? "bg-green-100 text-green-600"
                                  : "bg-blue-100 text-blue-600"
                              )}>
                                {link.share_type === 'view' ? (
                                  <Eye size={16} />
                                ) : (
                                  <Edit size={16} />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {link.share_type === 'view' ? 'View Only' : 'Can Edit'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {link.access_count || 0} views
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyLink(link);
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600"
                            >
                              {copiedId === link.id ? (
                                <Check size={14} className="text-green-600" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Advanced Options Link */}
                  <div className="border-t border-gray-100 px-5 py-4">
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        // Open the full desktop sharing dialog
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('open-deck-sharing-full'));
                        }, 100);
                      }}
                      className="w-full flex items-center justify-center gap-2 text-sm text-gray-500"
                    >
                      <ExternalLink size={14} />
                      Advanced sharing options
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Safe area padding for iOS */}
            <div className="h-safe-bottom bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MobileShareSheet;
