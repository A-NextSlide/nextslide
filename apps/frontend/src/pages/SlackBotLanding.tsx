import React from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  MessagesSquare,
  ExternalLink,
  Users,
  Sparkles,
  Link2,
  Terminal,
  BookOpen,
} from 'lucide-react';
import DynamicMeta from '@/components/seo/DynamicMeta';
import { toolPages } from '@/config/toolPages';

/* ───────────────────────────── Slack Icon (brand SVG) ───────────────── */
const SlackLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
    <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
    <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
    <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
  </svg>
);

/* ───────────────────────────── Tiny NextSlide icon ──────────────────── */
const NextSlideBot: React.FC = () => (
  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  </div>
);

/* ─────────────────────── Faux Slack avatar ──────────────────────────── */
const UserAvatar: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <div
    className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
    style={{ backgroundColor: color }}
  >
    {name[0]}
  </div>
);

/* ───────────────────── Mock slide thumbnail (CSS art) ───────────────── */
const MockSlideThumbnail: React.FC = () => (
  <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)' }}>
    {/* Decorative grid lines */}
    <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

    {/* Subtle glow */}
    <div className="absolute top-0 right-0 w-1/2 h-1/2 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)' }} />

    {/* Title block */}
    <div className="absolute top-[12%] left-[6%] right-[6%]">
      <div className="h-1 w-16 rounded-full bg-indigo-400/60 mb-3" />
      <div className="text-white font-bold text-[clamp(14px,2.8vw,28px)] leading-tight tracking-tight" style={{ fontFamily: '"HK Grotesk Wide", system-ui, sans-serif' }}>
        Q4 Board Meeting
      </div>
      <div className="text-indigo-300/80 text-[clamp(8px,1.4vw,14px)] mt-1 font-medium">
        Revenue &amp; Growth Metrics
      </div>
    </div>

    {/* Bar chart */}
    <div className="absolute bottom-[10%] left-[6%] flex items-end gap-[4%] h-[38%] w-[50%]">
      <div className="flex-1 rounded-t-sm" style={{ height: '45%', background: 'linear-gradient(to top, #6366f1, #818cf8)' }} />
      <div className="flex-1 rounded-t-sm" style={{ height: '62%', background: 'linear-gradient(to top, #6366f1, #818cf8)' }} />
      <div className="flex-1 rounded-t-sm" style={{ height: '55%', background: 'linear-gradient(to top, #6366f1, #818cf8)' }} />
      <div className="flex-1 rounded-t-sm" style={{ height: '80%', background: 'linear-gradient(to top, #a78bfa, #c4b5fd)' }} />
      <div className="flex-1 rounded-t-sm" style={{ height: '100%', background: 'linear-gradient(to top, #2EB67D, #6ee7b7)' }} />
    </div>

    {/* Donut chart decoration */}
    <div className="absolute bottom-[14%] right-[8%] w-[22%] aspect-square">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <circle cx="50" cy="50" r="38" fill="none" stroke="#6366f1" strokeWidth="12" strokeDasharray="155 240" strokeLinecap="round" opacity="0.8" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#2EB67D" strokeWidth="12" strokeDasharray="60 240" strokeDashoffset="-155" strokeLinecap="round" opacity="0.8" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#ECB22E" strokeWidth="12" strokeDasharray="25 240" strokeDashoffset="-215" strokeLinecap="round" opacity="0.8" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white font-bold text-[clamp(8px,1.6vw,16px)]">78%</span>
      </div>
    </div>

    {/* Slide count badge */}
    <div className="absolute top-3 right-3 bg-white/10 backdrop-blur-sm text-white/80 text-[10px] px-2 py-0.5 rounded-full font-medium">
      1 / 10
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                       */
/* ═══════════════════════════════════════════════════════════════════════ */

export default function SlackBotLanding() {
  const faqs = [
    { question: 'How do I install the NextSlide Slack bot?', answer: 'Go to your NextSlide dashboard, navigate to Integrations, and click "Add to Slack". You\'ll be redirected to authorize the bot for your workspace.' },
    { question: 'What data does the bot access?', answer: 'The bot only reads messages in channels where it\'s explicitly invoked with /nextslide. It reads recent messages for context but doesn\'t store conversation history.' },
    { question: 'Can I customize the generated presentations?', answer: 'Every deck generated by the bot comes with a direct edit link. Click "Edit in NextSlide" to open the full editor and customize slides, themes, and content.' },
    { question: 'Does it work in DMs and private channels?', answer: 'Yes! The bot works in public channels, private channels, and direct messages. Just type /nextslide followed by your topic.' },
    { question: 'How many slides does it generate?', answer: 'The bot intelligently determines the right number of slides based on your topic and context, typically between 8\u201315 slides. You can always add or remove slides in the editor.' },
  ];

  const otherTools = toolPages.filter((t) => t.slug !== 'slack-bot');

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}>
      <DynamicMeta
        title="Slack Bot for Presentations | NextSlide AI"
        description="Generate beautiful slide decks directly from Slack conversations. Type /nextslide in any channel and let AI turn your messages into polished presentations."
        url="https://nextslide.ai/slack-bot"
        type="website"
      />

      {/* ─────────────────────── HERO ─────────────────────── */}
      <section className="relative overflow-hidden bg-[#4A154B]">
        {/* Subtle aubergine texture */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        {/* Glow orbs */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #611f69, transparent 70%)' }} />
        <div className="absolute -bottom-60 -left-40 w-[400px] h-[400px] rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #36C5F0, transparent 70%)' }} />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-20 sm:pb-32">
          {/* Navigation */}
          <div className="mb-10">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back to NextSlide
            </Link>
          </div>

          {/* Headline */}
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-6">
              <SlackLogo className="w-4 h-4" />
              <span className="text-white/80 text-sm font-medium">Slack Integration</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white tracking-tight leading-[1.1]">
              Turn Slack threads into<br className="hidden sm:block" /> stunning presentations
            </h1>
            <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
              Type <span className="font-mono bg-white/10 text-white/90 px-2 py-0.5 rounded text-sm">/nextslide</span> in any channel. The bot reads your messages, analyzes shared files and links, generates a polished deck, and shares it back — all without leaving Slack.
            </p>
          </div>

          {/* ── SLACK WORKSPACE MOCKUP ── */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 max-w-5xl mx-auto">
            <div className="flex min-h-[520px] sm:min-h-[580px]">

              {/* SIDEBAR (hidden mobile) */}
              <div className="hidden md:flex flex-col w-[220px] flex-shrink-0 bg-[#3F0E40] border-r border-white/10">
                {/* Workspace header */}
                <div className="px-4 pt-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center text-white text-xs font-bold">A</div>
                    <span className="text-white font-bold text-[15px] truncate">Acme Corp</span>
                    <svg className="w-3.5 h-3.5 text-white/50 ml-auto flex-shrink-0" fill="none" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                </div>

                {/* Channel list */}
                <div className="flex-1 overflow-hidden py-3 px-2 space-y-px text-[14px]">
                  <div className="px-2 py-0.5 text-white/40 text-xs font-semibold uppercase tracking-wider mb-1">Channels</div>
                  <div className="px-2 py-1 rounded text-white/60 hover:bg-white/5 cursor-default"># general</div>
                  <div className="px-2 py-1 rounded bg-[#1264A3] text-white font-medium cursor-default"># marketing</div>
                  <div className="px-2 py-1 rounded text-white/60 hover:bg-white/5 cursor-default"># design</div>
                  <div className="px-2 py-1 rounded text-white/60 hover:bg-white/5 cursor-default"># sales-team</div>
                  <div className="px-2 py-1 rounded text-white/60 hover:bg-white/5 cursor-default"># product</div>
                  <div className="px-2 py-1 rounded text-white/40 text-xs mt-4 font-semibold uppercase tracking-wider mb-1">Direct Messages</div>
                  <div className="px-2 py-1 rounded text-white/60 hover:bg-white/5 cursor-default flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#2EB67D]" />Sarah K.
                  </div>
                  <div className="px-2 py-1 rounded text-white/60 hover:bg-white/5 cursor-default flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white/30" />James R.
                  </div>
                </div>
              </div>

              {/* MAIN CHAT AREA */}
              <div className="flex-1 flex flex-col bg-white">
                {/* Channel header */}
                <div className="h-12 sm:h-[50px] border-b border-zinc-200 flex items-center px-4 sm:px-5 flex-shrink-0">
                  <span className="font-bold text-zinc-900 text-[15px]"># marketing</span>
                  <span className="hidden sm:inline-block ml-3 text-zinc-400 text-sm truncate">Q4 planning and campaign coordination</span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">

                  {/* ── User message with file attachment ── */}
                  <div className="flex items-start gap-2.5">
                    <UserAvatar name="Sarah" color="#E01E5A" />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-zinc-900 text-[15px]">Sarah Kim</span>
                        <span className="text-xs text-zinc-400">2:14 PM</span>
                      </div>
                      <p className="text-[15px] text-zinc-800 leading-relaxed mt-0.5">
                        We need a deck for the Q4 board meeting with our revenue numbers
                      </p>
                      {/* File attachment (Slack style) */}
                      <div className="mt-2 flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-2 max-w-xs bg-zinc-50">
                        <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
                            <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" />
                            <path d="M9 1v4h4" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-800 truncate">Q4-Revenue-Report.xlsx</p>
                          <p className="text-xs text-zinc-400">48 KB</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Slash command ── */}
                  <div className="flex items-start gap-2.5">
                    <UserAvatar name="Sarah" color="#E01E5A" />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-zinc-900 text-[15px]">Sarah Kim</span>
                        <span className="text-xs text-zinc-400">2:14 PM</span>
                      </div>
                      <p className="text-[15px] text-zinc-800 leading-relaxed mt-0.5">
                        <span className="font-mono bg-zinc-100 text-[#4A154B] px-1.5 py-0.5 rounded text-sm font-semibold">/nextslide</span>{' '}
                        Q4 board meeting - revenue, growth metrics, and 2025 projections
                      </p>
                    </div>
                  </div>

                  {/* ── Bot: context gathering ── */}
                  <div className="flex items-start gap-2.5">
                    <NextSlideBot />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 text-[15px]">NextSlide</span>
                        <span className="bg-zinc-200 text-zinc-600 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded">APP</span>
                        <span className="text-xs text-zinc-400">2:14 PM</span>
                      </div>
                      <div className="mt-1.5 border-l-[3px] border-indigo-400 pl-3 py-0.5 text-[15px] text-zinc-600">
                        <p className="font-medium text-zinc-800">Topic: Q4 board meeting</p>
                        <p className="text-sm text-zinc-500 mt-0.5">Reading 24 recent messages...</p>
                        <p className="text-sm text-zinc-500 mt-0.5">Analyzing 1 shared file...</p>
                        <p className="text-sm text-zinc-400 italic mt-0.5">Gathering context from this conversation...</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Bot: generation progress ── */}
                  <div className="flex items-start gap-2.5">
                    <NextSlideBot />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 text-[15px]">NextSlide</span>
                        <span className="bg-zinc-200 text-zinc-600 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded">APP</span>
                        <span className="text-xs text-zinc-400">2:15 PM</span>
                      </div>
                      <div className="mt-1.5 text-[15px]">
                        <p className="font-bold text-zinc-800">Generating Q4 Board Meeting...</p>
                        <p className="font-mono text-sm text-zinc-600 mt-1">
                          <span className="tracking-tight">{'███████░░░'}</span>{' '}
                          <span className="text-zinc-500">70%</span>
                          {'  '}
                          <span className="text-zinc-400">7/10 slides</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Bot: COMPLETED — THE HERO ── */}
                  <div className="flex items-start gap-2.5">
                    <NextSlideBot />
                    <div className="min-w-0 flex-1 max-w-full">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 text-[15px]">NextSlide</span>
                        <span className="bg-zinc-200 text-zinc-600 text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded">APP</span>
                        <span className="text-xs text-zinc-400">2:16 PM</span>
                      </div>

                      {/* Slack Block Kit card */}
                      <div className="mt-2 max-w-lg">
                        {/* THUMBNAIL — blown up */}
                        <MockSlideThumbnail />

                        {/* Deck info */}
                        <div className="mt-3">
                          <p className="font-bold text-zinc-900 text-[15px]">Q4 Board Meeting</p>
                          <p className="text-sm text-zinc-500 mt-0.5">10 slides &bull; Ready to present</p>
                        </div>

                        {/* Action buttons (Slack style) */}
                        <div className="flex items-center gap-2 mt-3">
                          <button className="px-4 py-1.5 rounded-md text-sm font-bold text-white bg-[#2EB67D] hover:bg-[#28a06e] transition-colors">
                            View Presentation
                          </button>
                          <button className="px-4 py-1.5 rounded-md text-sm font-medium text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 transition-colors">
                            Edit in NextSlide
                          </button>
                        </div>

                        {/* Context footer */}
                        <p className="mt-3 text-xs text-zinc-400 flex items-center gap-1">
                          Created with{' '}
                          <span className="text-[#1264A3] hover:underline cursor-pointer">NextSlide</span>
                        </p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Message input bar */}
                <div className="border-t border-zinc-200 px-4 sm:px-5 py-3 flex-shrink-0">
                  <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-400 flex items-center">
                    <span>Message #marketing</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/40">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16"><path d="M13.3 5.3l-6 6-3.3-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Free to install
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16"><path d="M13.3 5.3l-6 6-3.3-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Works with any workspace
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16"><path d="M13.3 5.3l-6 6-3.3-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              No data stored
            </span>
          </div>
        </div>
      </section>

      {/* ─────────────────────── HOW IT WORKS ─────────────────────── */}
      <section className="py-16 sm:py-24 bg-zinc-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 text-center mb-14">
            How It Works
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Terminal, label: 'Type /nextslide in any channel' },
              { icon: BookOpen, label: 'Bot reads your conversation context' },
              { icon: Sparkles, label: 'AI generates your presentation' },
              { icon: Link2, label: 'Share the link right in Slack' },
            ].map((step, idx) => (
              <div key={idx} className="relative flex flex-col items-center text-center">
                {idx > 0 && (
                  <div className="hidden lg:block absolute -left-4 top-7 w-8 h-px bg-zinc-300" />
                )}
                <div className="w-14 h-14 rounded-2xl bg-white border border-zinc-200 flex items-center justify-center mb-4 shadow-sm">
                  <step.icon className="w-5 h-5 text-[#4A154B]" />
                </div>
                <div className="bg-[#4A154B] text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center mb-3">
                  {idx + 1}
                </div>
                <p className="text-sm sm:text-base text-zinc-700 leading-relaxed max-w-[200px]">
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── FEATURES ─────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 text-center mb-14">
            Built for Slack Teams
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { icon: MessageSquare, title: 'Messages + Files', desc: 'Reads up to 30 recent messages and processes shared files — PDFs, spreadsheets, docs, images — all extracted automatically.' },
              { icon: MessagesSquare, title: 'Conversation-Driven', desc: 'Need changes? The bot asks smart clarifying questions before generating.' },
              { icon: ExternalLink, title: 'Link Unfurling', desc: 'Share any NextSlide link in Slack and get a rich preview with the slide thumbnail.' },
              { icon: Users, title: 'Team Collaboration', desc: 'Anyone in the channel can view the generated deck instantly.' },
            ].map((card, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-zinc-200 bg-white p-6 hover:shadow-md hover:border-[#4A154B]/20 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-[#4A154B]/10 flex items-center justify-center mb-4">
                  <card.icon className="w-5 h-5 text-[#4A154B]" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">{card.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── USE CASES ─────────────────────── */}
      <section className="py-16 sm:py-24 bg-zinc-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 text-center mb-4">
            Popular Use Cases
          </h2>
          <p className="text-zinc-500 text-center mb-14 max-w-2xl mx-auto">
            Your team is already having the conversations. Now turn them into presentations.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { title: 'Standup Recaps', desc: 'Turn daily standup notes into visual status updates for stakeholders' },
              { title: 'Meeting Prep', desc: 'Generate slide decks from planning threads before the meeting starts' },
              { title: 'Client Proposals', desc: 'Convert sales conversations into polished pitch decks in seconds' },
              { title: 'Sprint Reviews', desc: 'Summarize engineering threads into demo-ready presentations' },
            ].map((uc, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-white border border-zinc-200 p-6 hover:shadow-md transition-shadow"
              >
                <h3 className="text-base font-semibold text-zinc-900 mb-2">{uc.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── CTA ─────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <SlackLogo className="w-12 h-12 mx-auto mb-6" />
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-4">
            Add NextSlide to your workspace
          </h2>
          <p className="text-zinc-500 mb-8 max-w-lg mx-auto">
            Install in under a minute. No per-seat pricing, no complex setup. Just type the command and present.
          </p>

          {/* Official "Add to Slack" style button */}
          <Link
            to="/admin/services?tab=integrations"
            className="inline-flex items-center gap-3 bg-white border-2 border-zinc-200 rounded-xl px-8 py-4 hover:border-[#4A154B]/30 hover:shadow-lg transition-all group"
          >
            <SlackLogo className="w-6 h-6" />
            <span className="text-lg font-bold text-zinc-900 group-hover:text-[#4A154B] transition-colors">
              Add to Slack
            </span>
          </Link>

          <p className="mt-4 text-sm text-zinc-400">
            Works with any Slack workspace &bull; Free with your NextSlide plan
          </p>
        </div>
      </section>

      {/* ─────────────────────── FAQ ─────────────────────── */}
      <section className="py-16 sm:py-24 bg-zinc-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 text-center mb-12">
            Frequently Asked Questions
          </h2>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <details
                key={idx}
                className="group rounded-xl border border-zinc-200 bg-white overflow-hidden"
              >
                <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-left select-none hover:bg-zinc-50 transition-colors">
                  <span className="text-base font-medium text-zinc-900 pr-4">
                    {faq.question}
                  </span>
                  <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-zinc-400 group-open:rotate-45 transition-transform duration-200">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <div className="px-6 pb-5 text-sm text-zinc-600 leading-relaxed">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── TOOL LINKS FOOTER ─────────────────────── */}
      <section className="py-16 sm:py-20 border-t border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 text-center mb-8">
            More AI Presentation Tools
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherTools.map((tool) => (
              <Link
                key={tool.slug}
                to={`/${tool.slug}`}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 hover:border-[#4A154B]/30 hover:shadow-sm transition-all group"
              >
                <div className="w-2 h-2 rounded-full bg-[#4A154B]/30 group-hover:bg-[#4A154B] transition-colors flex-shrink-0" />
                <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 transition-colors">
                  {tool.title}
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link to="/" className="text-sm text-zinc-500 hover:text-[#4A154B] transition-colors">
              NextSlide AI &mdash; Create presentations with artificial intelligence
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
