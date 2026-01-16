import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  Copy,
  Check,
  Key,
  Zap,
  Terminal,
  Webhook,
  Shield,
  Clock,
  FileText,
  Upload,
  Image as ImageIcon,
  FileUp,
  Braces,
  Activity,
  Lock,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { billingApi } from '@/services/billingApi';

const DeveloperAPI: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);

  // Enable scrolling on this page (reset any overflow:hidden from other pages)
  useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login?redirect=/developers');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const checkPro = async () => {
      if (!user) return;
      try {
        const balance = await billingApi.getBalance();
        setIsPro(
          balance.plan_id === 'pro' ||
          balance.plan_id === 'enterprise' ||
          balance.is_friends_family
        );
      } catch {
        setIsPro(false);
      }
    };
    checkPro();
  }, [user]);

  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(id);
      setTimeout(() => setCopiedCode(null), 2000);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed' });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#09090B]">
        <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[#FAFAFA]/80 dark:bg-[#09090B]/80 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate('/app')}
            className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to app</span>
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/profile?tab=api')}
            className="gap-2"
          >
            <Key className="h-3.5 w-3.5" />
            Manage API Keys
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-100/40 via-transparent to-transparent dark:from-orange-900/20" />
        <div className="relative max-w-[1200px] mx-auto px-6 py-14 lg:py-16">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 text-[10px] font-semibold uppercase tracking-wider mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                REST API v1
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-3">
                NextSlide API
              </h1>
              <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Generate presentations programmatically. Add your branding, get webhook notifications, full JSON output.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isPro ? (
                <Button
                  onClick={() => navigate('/profile?tab=api')}
                  className="gap-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 dark:text-zinc-900"
                >
                  Get API Key
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => navigate('/pricing?from=developers')}
                  className="gap-2 bg-orange-500 hover:bg-orange-600"
                >
                  <Zap className="h-4 w-4" />
                  Upgrade to Pro
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => document.getElementById('endpoints')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Endpoints
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Quick Start */}
      <section className="py-12 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Quick Start</h2>
            <div className="hidden md:flex items-center gap-1 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span>3 steps to your first deck</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-10">
            {[
              { step: '1', icon: Key, title: 'Get API key', desc: 'Create in Settings' },
              { step: '2', icon: Terminal, title: 'POST request', desc: 'Send topic & slides' },
              { step: '3', icon: Globe, title: 'Get deck URL', desc: 'Share immediately' }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 text-xs font-bold">
                  {item.step}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.title}</div>
                  <div className="text-xs text-zinc-500">{item.desc}</div>
                </div>
                <item.icon className="h-4 w-4 text-zinc-400 flex-shrink-0" />
              </div>
            ))}
          </div>

          {/* Example Request */}
          <div className="rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-[#0D0D0D]">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                </div>
                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">Example</span>
              </div>
              <button
                onClick={() => handleCopy(`curl -X POST https://api.nextslide.ai/v1/decks \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"topic": "Q4 Sales Review", "slides": 10}'`, 'quickstart')}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {copiedCode === 'quickstart' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
              <span className="text-emerald-400">curl</span>{' '}
              <span className="text-zinc-500">-X POST</span>{' '}
              <span className="text-amber-300">https://api.nextslide.ai/v1/decks</span>{' '}
              <span className="text-zinc-600">\</span>{'\n'}
              {'  '}<span className="text-zinc-500">-H</span>{' '}
              <span className="text-sky-300">"X-API-Key: YOUR_API_KEY"</span>{' '}
              <span className="text-zinc-600">\</span>{'\n'}
              {'  '}<span className="text-zinc-500">-H</span>{' '}
              <span className="text-sky-300">"Content-Type: application/json"</span>{' '}
              <span className="text-zinc-600">\</span>{'\n'}
              {'  '}<span className="text-zinc-500">-d</span>{' '}
              <span className="text-emerald-300">{'\'{"topic": "Q4 Sales Review", "slides": 10}\''}</span>
            </pre>
          </div>
        </div>
      </section>

      {/* Custom Context Section */}
      <section className="py-12 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Custom Context</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Add brand guidelines, images, or instructions to every deck</p>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-100/80 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-medium">
              <FileUp className="h-3 w-3" />
              Upload in Settings
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            {[
              { icon: FileText, title: 'PDFs', desc: 'Brand guides', color: 'blue' },
              { icon: ImageIcon, title: 'Images', desc: 'Logos, examples', color: 'emerald' },
              { icon: Braces, title: 'Instructions', desc: 'Custom prompts', color: 'amber' },
              { icon: Upload, title: 'More formats', desc: 'PNG, JPG, WEBP', color: 'zinc' }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60">
                <div className={cn(
                  'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
                  item.color === 'blue' && 'bg-blue-100 dark:bg-blue-900/30',
                  item.color === 'emerald' && 'bg-emerald-100 dark:bg-emerald-900/30',
                  item.color === 'amber' && 'bg-amber-100 dark:bg-amber-900/30',
                  item.color === 'zinc' && 'bg-zinc-100 dark:bg-zinc-800'
                )}>
                  <item.icon className={cn(
                    'h-4 w-4',
                    item.color === 'blue' && 'text-blue-600 dark:text-blue-400',
                    item.color === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
                    item.color === 'amber' && 'text-amber-600 dark:text-amber-400',
                    item.color === 'zinc' && 'text-zinc-600 dark:text-zinc-400'
                  )} />
                </div>
                <div>
                  <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.title}</div>
                  <div className="text-xs text-zinc-500">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Authentication */}
      <section className="py-12 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-5 w-5 text-zinc-500" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Authentication</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Pass your API key in the <code className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-xs font-mono">X-API-Key</code> header.
              </p>
              <div className="rounded-lg overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-[#0D0D0D]">
                <pre className="p-3 text-sm font-mono text-zinc-300">
                  <span className="text-sky-300">X-API-Key</span>
                  <span className="text-zinc-500">:</span>{' '}
                  <span className="text-emerald-300">ns_live_xxxxxxxxxxxxxxxx</span>
                </pre>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80">
              <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-zinc-500" />
                Security
              </h4>
              <ul className="space-y-2">
                {[
                  'Store in environment variables',
                  'Server-side only, never in browsers',
                  'Rotate periodically'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section id="endpoints" className="py-12 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Endpoints</h2>
          </div>

          <div className="space-y-3">
            <EndpointCard
              method="POST"
              path="/v1/decks"
              description="Create a new presentation"
              requestBody={`{
  "topic": "string",              // Required
  "slides": 10,                   // Optional, 1-30
  "style": "corporate",           // Optional
  "additional_instructions": "",  // Optional
  "metadata": {}                  // Optional, passed to webhook
}`}
              responseBody={`{
  "deck_id": "uuid",
  "status": "generating",
  "view_url": "https://nextslide.ai/p/abc123",
  "edit_url": "https://nextslide.ai/e/xyz789",
  "poll_url": "https://api.nextslide.ai/v1/decks/{id}/status",
  "estimated_seconds": 120
}`}
              onCopy={handleCopy}
              copiedCode={copiedCode}
            />

            <EndpointCard
              method="GET"
              path="/v1/decks/{id}/status"
              description="Poll generation status"
              responseBody={`{
  "deck_id": "uuid",
  "status": "completed",  // generating | completed | failed
  "view_url": "...",
  "slides_count": 10,
  "completed_at": "2024-01-15T12:00:00Z",
  "error_message": null
}`}
              onCopy={handleCopy}
              copiedCode={copiedCode}
            />

            <EndpointCard
              method="GET"
              path="/v1/decks/{id}"
              description="Get complete deck data including slides"
              responseBody={`{
  "uuid": "...",
  "name": "Q4 Sales Review",
  "slides": [...],
  "size": { "width": 1920, "height": 1080 },
  "status": { "state": "completed" }
}`}
              onCopy={handleCopy}
              copiedCode={copiedCode}
            />

            <EndpointCard
              method="GET"
              path="/v1/decks"
              description="List all API-created decks"
              responseBody={`{
  "decks": [...],
  "total": 25,
  "offset": 0,
  "limit": 20
}`}
              onCopy={handleCopy}
              copiedCode={copiedCode}
            />

            <EndpointCard
              method="DELETE"
              path="/v1/decks/{id}"
              description="Permanently delete a deck"
              responseBody={`{
  "success": true,
  "message": "Deck deleted"
}`}
              onCopy={handleCopy}
              copiedCode={copiedCode}
            />
          </div>
        </div>
      </section>

      {/* Webhooks */}
      <section className="py-12 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center gap-3 mb-6">
            <Webhook className="h-5 w-5 text-zinc-500" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Webhooks</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <div>
              <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Payload</h4>
              <div className="rounded-lg overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-[#0D0D0D]">
                <pre className="p-3 text-xs font-mono text-zinc-300 overflow-x-auto">
{`{
  "event": "deck.completed",
  "deck_id": "uuid",
  "status": "completed",
  "view_url": "https://nextslide.ai/p/abc123",
  "edit_url": "https://nextslide.ai/e/xyz789",
  "slides_count": 10,
  "metadata": { ... },
  "timestamp": "2024-01-15T12:00:00Z"
}`}
                </pre>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Signature</h4>
              <div className="rounded-lg overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-[#0D0D0D]">
                <pre className="p-3 text-xs font-mono text-zinc-300 overflow-x-auto">
{`X-NextSlide-Signature: <hmac_sha256>
X-NextSlide-Timestamp: <unix_timestamp>

# Verify with:
signed = f"{timestamp}.{body}"
expected = hmac.new(secret, signed, sha256)`}
                </pre>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { event: 'deck.created', color: 'blue', desc: 'Generation started' },
              { event: 'deck.completed', color: 'emerald', desc: 'Successfully generated' },
              { event: 'deck.failed', color: 'red', desc: 'Generation failed' }
            ].map((item) => (
              <div key={item.event} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80">
                <code className={cn(
                  'text-xs font-mono px-2 py-0.5 rounded',
                  item.color === 'blue' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                  item.color === 'emerald' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                  item.color === 'red' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                )}>
                  {item.event}
                </code>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Examples */}
      <section className="py-12 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Examples</h2>
          </div>

          <Tabs defaultValue="python" className="w-full">
            <TabsList className="bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg mb-4">
              <TabsTrigger value="curl" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900">cURL</TabsTrigger>
              <TabsTrigger value="python" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900">Python</TabsTrigger>
              <TabsTrigger value="javascript" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900">Node.js</TabsTrigger>
            </TabsList>

            <TabsContent value="curl">
              <CodeBlock
                code={`curl -X POST https://api.nextslide.ai/v1/decks \\
  -H "X-API-Key: $NEXTSLIDE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "topic": "Quarterly Business Review",
    "slides": 12
  }'`}
                id="curl"
                onCopy={handleCopy}
                copiedCode={copiedCode}
              />
            </TabsContent>

            <TabsContent value="python">
              <CodeBlock
                code={`import requests
import os
import time

# Create presentation
response = requests.post(
    "https://api.nextslide.ai/v1/decks",
    headers={
        "X-API-Key": os.environ["NEXTSLIDE_API_KEY"],
        "Content-Type": "application/json"
    },
    json={
        "topic": "Quarterly Business Review",
        "slides": 12
    }
)

result = response.json()
print(f"View URL: {result['view_url']}")

# Poll for completion
while True:
    status = requests.get(
        f"https://api.nextslide.ai/v1/decks/{result['deck_id']}/status",
        headers={"X-API-Key": os.environ["NEXTSLIDE_API_KEY"]}
    ).json()

    if status["status"] == "completed":
        print(f"Done! {status['slides_count']} slides")
        break
    elif status["status"] == "failed":
        print(f"Error: {status['error_message']}")
        break

    time.sleep(5)`}
                id="python"
                onCopy={handleCopy}
                copiedCode={copiedCode}
              />
            </TabsContent>

            <TabsContent value="javascript">
              <CodeBlock
                code={`const response = await fetch("https://api.nextslide.ai/v1/decks", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.NEXTSLIDE_API_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    topic: "Quarterly Business Review",
    slides: 12
  })
});

const result = await response.json();
console.log("View URL:", result.view_url);

// Poll for completion
const poll = async () => {
  const status = await fetch(
    \`https://api.nextslide.ai/v1/decks/\${result.deck_id}/status\`,
    { headers: { "X-API-Key": process.env.NEXTSLIDE_API_KEY } }
  ).then(r => r.json());

  if (status.status === "completed") {
    console.log(\`Done! \${status.slides_count} slides\`);
  } else if (status.status === "generating") {
    setTimeout(poll, 5000);
  }
};

poll();`}
                id="javascript"
                onCopy={handleCopy}
                copiedCode={copiedCode}
              />
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Rate Limits */}
      <section className="py-12 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="h-5 w-5 text-zinc-500" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Limits & Billing</h2>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { label: 'Per slide', value: '5 credits' },
              { label: '10-slide deck', value: '50 credits' },
              { label: 'Concurrent', value: '3 max' },
              { label: 'Rate limit', value: '60/min' }
            ].map((item, i) => (
              <div key={i} className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80">
                <div className="text-xs text-zinc-500 mb-1">{item.label}</div>
                <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center justify-between p-6 rounded-2xl bg-zinc-900 dark:bg-zinc-100">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100 dark:text-zinc-900 mb-1">Ready to build?</h2>
              <p className="text-sm text-zinc-400 dark:text-zinc-600">Create your API key and start generating decks.</p>
            </div>
            <Button
              onClick={() => navigate('/profile?tab=api')}
              className="gap-2 bg-white hover:bg-zinc-100 text-zinc-900"
            >
              Get API Key
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

// Endpoint Card Component
interface EndpointCardProps {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  requestBody?: string;
  responseBody: string;
  onCopy: (code: string, id: string) => void;
  copiedCode: string | null;
}

const EndpointCard: React.FC<EndpointCardProps> = ({
  method,
  path,
  description,
  requestBody,
  responseBody,
  onCopy,
  copiedCode
}) => {
  const methodConfig = {
    GET: { bg: 'bg-emerald-500' },
    POST: { bg: 'bg-blue-500' },
    PUT: { bg: 'bg-amber-500' },
    DELETE: { bg: 'bg-red-500' },
    PATCH: { bg: 'bg-violet-500' }
  };

  const id = `${method}-${path}`;
  const config = methodConfig[method];

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center gap-3">
        <div className={cn('px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white', config.bg)}>
          {method}
        </div>
        <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{path}</code>
        <span className="text-xs text-zinc-500 ml-auto hidden sm:block">{description}</span>
      </div>
      <div className={cn('grid divide-y md:divide-y-0 md:divide-x divide-zinc-200/80 dark:divide-zinc-800/80', requestBody ? 'md:grid-cols-2' : '')}>
        {requestBody && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Request</span>
              <button
                onClick={() => onCopy(requestBody, `${id}-req`)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                {copiedCode === `${id}-req` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded overflow-x-auto">
              {requestBody}
            </pre>
          </div>
        )}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Response</span>
            <button
              onClick={() => onCopy(responseBody, `${id}-res`)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              {copiedCode === `${id}-res` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          <pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded overflow-x-auto">
            {responseBody}
          </pre>
        </div>
      </div>
    </div>
  );
};

// Code Block Component
interface CodeBlockProps {
  code: string;
  id: string;
  onCopy: (code: string, id: string) => void;
  copiedCode: string | null;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, id, onCopy, copiedCode }) => {
  return (
    <div className="rounded-lg overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-[#0D0D0D]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        </div>
        <button
          onClick={() => onCopy(code, id)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copiedCode === id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
        {code}
      </pre>
    </div>
  );
};

export default DeveloperAPI;
