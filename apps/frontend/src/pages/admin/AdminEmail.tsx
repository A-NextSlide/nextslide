import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import {
  adminApi,
  type EmailTemplate,
  type EmailCampaign,
  type EmailSend,
  type EmailSendsResponse,
} from '@/services/adminApi';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ==================== Design Tokens (match AdminServices/AdminGrowth) ====================
const sectionHeading = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="w-6 h-6 border-2 border-[#eaeaea] dark:border-[#333] border-t-black dark:border-t-white rounded-full animate-spin" />
  </div>
);

// ==================== Category Badges ====================
const categoryColors: Record<string, string> = {
  transactional: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  growth: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  onboarding: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  product_updates: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  sending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const sendStatusColors: Record<string, string> = {
  pending: 'text-gray-500',
  sent: 'text-green-600 dark:text-green-400',
  delivered: 'text-blue-600 dark:text-blue-400',
  bounced: 'text-red-600 dark:text-red-400',
  failed: 'text-red-600 dark:text-red-400',
};

// ==================== Tab Definitions ====================
const tabs = [
  { id: 'templates', label: 'Templates' },
  { id: 'editor', label: 'Editor' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'history', label: 'History' },
];

// ==================== Main Component ====================
const AdminEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialTab = tabs.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab')! : 'templates';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');

  // Editor state
  const [editorMessages, setEditorMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [editorInput, setEditorInput] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [editorSubject, setEditorSubject] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveSlug, setSaveSlug] = useState('');
  const [saveCategory, setSaveCategory] = useState('growth');
  const editorChatRef = useRef<HTMLDivElement>(null);

  // Campaigns state
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campName, setCampName] = useState('');
  const [campTemplateId, setCampTemplateId] = useState('');
  const [campSubjectOverride, setCampSubjectOverride] = useState('');
  const [campAudience, setCampAudience] = useState('all');
  const [campInactivityDays, setCampInactivityDays] = useState(30);
  const [campScheduleNow, setCampScheduleNow] = useState(true);
  const [campScheduleAt, setCampScheduleAt] = useState('');
  const [campRecipientCount, setCampRecipientCount] = useState<number | null>(null);
  const [campCreating, setCampCreating] = useState(false);

  // History state
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [sendsTotal, setSendsTotal] = useState(0);
  const [sendsPage, setSendsPage] = useState(1);
  const [sendsTotalPages, setSendsTotalPages] = useState(1);
  const [sendsFilter, setSendsFilter] = useState({ status: '', email: '' });

  // ==================== Data Loading ====================
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

  const loadTabData = useCallback(async (tab: string) => {
    setLoading(true);
    try {
      switch (tab) {
        case 'templates': {
          const data = await adminApi.getEmailTemplates(categoryFilter || undefined);
          setTemplates(data.templates);
          break;
        }
        case 'editor': {
          if (templatesRef.current.length === 0) {
            const data = await adminApi.getEmailTemplates();
            setTemplates(data.templates);
          }
          break;
        }
        case 'campaigns': {
          const needTemplates = templatesRef.current.length === 0;
          const [campData, tmplData] = await Promise.all([
            adminApi.getEmailCampaigns(),
            needTemplates ? adminApi.getEmailTemplates() : null,
          ]);
          setCampaigns(campData.campaigns);
          if (tmplData) setTemplates(tmplData.templates);
          break;
        }
        case 'history': {
          const data = await adminApi.getEmailSends({
            page: sendsPage,
            limit: 50,
            status: sendsFilter.status || undefined,
            email: sendsFilter.email || undefined,
          });
          setSends(data.sends);
          setSendsTotal(data.total);
          setSendsTotalPages(data.total_pages);
          break;
        }
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, toast]);

  useEffect(() => {
    loadTabData(activeTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, categoryFilter]);

  // Reload history when filters or page change
  useEffect(() => {
    if (activeTab === 'history') loadTabData('history');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendsPage, sendsFilter]);

  // Load audience count when audience changes
  useEffect(() => {
    if (!showNewCampaign) return;
    const config = campAudience === 'inactive' ? { inactivity_days: campInactivityDays } : {};
    adminApi.getCampaignRecipientCount(campAudience, config)
      .then(r => setCampRecipientCount(r.count))
      .catch(() => setCampRecipientCount(null));
  }, [campAudience, campInactivityDays, showNewCampaign]);

  // ==================== Handlers ====================
  const handlePreview = async (template: EmailTemplate) => {
    try {
      const result = await adminApi.previewEmailTemplate(template.id);
      setPreviewTemplate(template);
      setPreviewHtml(result.html);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSendTest = async (templateId: string) => {
    try {
      const result = await adminApi.sendTestEmail(templateId);
      toast({ title: 'Test email sent', description: `Sent to ${result.to}` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (template: EmailTemplate) => {
    try {
      await adminApi.updateEmailTemplate(template.id, { is_active: !template.is_active });
      loadTabData('templates');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleEditInEditor = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditorHtml(template.html_body);
    setEditorSubject(template.subject);
    setSaveName(template.name);
    setSaveSlug(template.slug);
    setSaveCategory(template.category);
    setEditorMessages([]);
    setActiveTab('editor');
  };

  const handleEditorSend = async () => {
    if (!editorInput.trim()) return;
    const userMsg = editorInput.trim();
    setEditorInput('');
    setEditorMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setEditorLoading(true);

    try {
      const result = await adminApi.generateEmailAI({
        prompt: userMsg,
        existing_html: editorHtml || undefined,
        template_context: editingTemplate ? `Editing template: ${editingTemplate.name}` : undefined,
      });
      setEditorHtml(result.html);
      setEditorSubject(result.subject);
      setEditorMessages(prev => [...prev, { role: 'assistant', content: `Updated email. Subject: "${result.subject}"` }]);
    } catch (e: any) {
      setEditorMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setEditorLoading(false);
      setTimeout(() => editorChatRef.current?.scrollTo({ top: editorChatRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }
  };

  const handleEditorSave = async () => {
    if (!editorHtml || !saveName || !saveSlug) {
      toast({ title: 'Missing fields', description: 'Name, slug, and HTML are required', variant: 'destructive' });
      return;
    }
    try {
      if (editingTemplate) {
        await adminApi.updateEmailTemplate(editingTemplate.id, {
          name: saveName,
          slug: saveSlug,
          subject: editorSubject,
          category: saveCategory as any,
          html_body: editorHtml,
        });
        toast({ title: 'Template updated' });
      } else {
        await adminApi.createEmailTemplate({
          name: saveName,
          slug: saveSlug,
          subject: editorSubject,
          category: saveCategory as any,
          html_body: editorHtml,
        });
        toast({ title: 'Template created' });
      }
      // Reload templates
      const data = await adminApi.getEmailTemplates();
      setTemplates(data.templates);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleEditorSendTest = async () => {
    if (!editorHtml) return;
    try {
      if (editingTemplate) {
        await adminApi.sendTestEmail(editingTemplate.id);
        toast({ title: 'Test email sent' });
      } else {
        toast({ title: 'Save first', description: 'Save the template before sending a test', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreateCampaign = async () => {
    if (!campName || !campTemplateId) {
      toast({ title: 'Missing fields', description: 'Name and template are required', variant: 'destructive' });
      return;
    }
    setCampCreating(true);
    try {
      const data: any = {
        name: campName,
        template_id: campTemplateId,
        subject_override: campSubjectOverride || undefined,
        audience: campAudience,
        audience_config: campAudience === 'inactive' ? { inactivity_days: campInactivityDays } : {},
      };
      if (!campScheduleNow && campScheduleAt) {
        data.scheduled_at = new Date(campScheduleAt).toISOString();
      }

      const campaign = await adminApi.createEmailCampaign(data);

      if (campScheduleNow) {
        await adminApi.sendEmailCampaign(campaign.id);
        toast({ title: 'Campaign started', description: 'Emails are being sent' });
      } else {
        toast({ title: 'Campaign scheduled' });
      }

      setShowNewCampaign(false);
      setCampName('');
      setCampTemplateId('');
      setCampSubjectOverride('');
      setCampAudience('all');
      setCampScheduleNow(true);
      setCampScheduleAt('');
      loadTabData('campaigns');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setCampCreating(false);
    }
  };

  const handleCancelCampaign = async (id: string) => {
    try {
      await adminApi.updateEmailCampaign(id, { status: 'cancelled' } as any);
      toast({ title: 'Campaign cancelled' });
      loadTabData('campaigns');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSendCampaign = async (id: string) => {
    try {
      await adminApi.sendEmailCampaign(id);
      toast({ title: 'Campaign started' });
      loadTabData('campaigns');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ==================== Tab Renderers ====================
  const renderTemplates = () => (
    <div>
      {/* Category filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['', 'transactional', 'growth', 'onboarding', 'product_updates'].map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              'px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors',
              categoryFilter === cat
                ? 'bg-[#FF4301] text-white'
                : 'bg-[#f5f5f5] dark:bg-[#222] text-[#666] dark:text-[#888] hover:bg-[#eee] dark:hover:bg-[#333]'
            )}
          >
            {cat ? cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'All'}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => {
            setEditingTemplate(null);
            setEditorHtml('');
            setEditorSubject('');
            setSaveName('');
            setSaveSlug('');
            setSaveCategory('growth');
            setEditorMessages([]);
            setActiveTab('editor');
          }}
          className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-black dark:bg-white text-white dark:text-black hover:opacity-80"
        >
          + Create Template
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map(t => (
            <div key={t.id} className={cn(cardClass, 'p-4 flex flex-col gap-2')}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium">{t.name}</h3>
                  <p className="text-[11px] text-[#888] mt-0.5">{t.subject}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', categoryColors[t.category] || 'bg-gray-100 text-gray-600')}>
                    {t.category.replace('_', ' ')}
                  </span>
                  {t.is_system && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f5f5f5] dark:bg-[#222] text-[#888] font-medium">
                      System
                    </span>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-[#999] flex items-center gap-3">
                <span>v{t.version}</span>
                <span>{new Date(t.updated_at).toLocaleDateString()}</span>
                <span className={t.is_active ? 'text-green-600' : 'text-red-500'}>{t.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 pt-2 border-t border-[#eaeaea] dark:border-[#333]">
                <button onClick={() => handlePreview(t)} className="text-[11px] text-[#FF4301] hover:underline">Preview</button>
                <button onClick={() => handleEditInEditor(t)} className="text-[11px] text-[#666] hover:text-black dark:hover:text-white">Edit</button>
                <button onClick={() => handleSendTest(t.id)} className="text-[11px] text-[#666] hover:text-black dark:hover:text-white">Send Test</button>
                <div className="flex-1" />
                <button onClick={() => handleToggleActive(t)} className="text-[11px] text-[#999] hover:text-black dark:hover:text-white">
                  {t.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreviewTemplate(null)}>
          <div className="bg-white dark:bg-[#111] rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#eaeaea] dark:border-[#333]">
              <div>
                <h3 className="text-sm font-medium">{previewTemplate.name}</h3>
                <p className="text-[11px] text-[#888]">{previewTemplate.subject}</p>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="text-[#999] hover:text-black dark:hover:text-white text-lg">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <iframe
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                className="w-full h-[500px] border border-[#eaeaea] dark:border-[#333] rounded-lg"
                title="Email preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderEditor = () => (
    <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[500px]">
      {/* Left: Chat */}
      <div className="w-1/2 flex flex-col">
        {/* Template selector + save fields */}
        <div className={cn(cardClass, 'p-3 mb-3')}>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-[#888] block mb-1">Load Template</label>
              <select
                value={editingTemplate?.id || ''}
                onChange={(e) => {
                  const t = templates.find(t => t.id === e.target.value);
                  if (t) handleEditInEditor(t);
                }}
                className="w-full text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
              >
                <option value="">New template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[#888] block mb-1">Category</label>
              <select
                value={saveCategory}
                onChange={(e) => setSaveCategory(e.target.value)}
                className="w-full text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
              >
                <option value="transactional">Transactional</option>
                <option value="growth">Growth</option>
                <option value="onboarding">Onboarding</option>
                <option value="product_updates">Product Updates</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Template name"
              className="text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
            />
            <input
              value={saveSlug}
              onChange={e => setSaveSlug(e.target.value)}
              placeholder="template-slug"
              className="text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
            />
          </div>
          <input
            value={editorSubject}
            onChange={e => setEditorSubject(e.target.value)}
            placeholder="Email subject line"
            className="w-full text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white mb-2"
          />
          <div className="flex gap-2">
            <button onClick={handleEditorSave} className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-black dark:bg-white text-white dark:text-black hover:opacity-80">
              {editingTemplate ? 'Update Template' : 'Save Template'}
            </button>
            <button onClick={handleEditorSendTest} className="px-3 py-1.5 text-[11px] font-medium rounded-md border border-[#ddd] dark:border-[#444] text-[#666] hover:text-black dark:hover:text-white">
              Send Test
            </button>
          </div>
        </div>

        {/* Chat messages */}
        <div ref={editorChatRef} className={cn(cardClass, 'flex-1 overflow-auto p-3 mb-3')}>
          {editorMessages.length === 0 && (
            <div className="text-center text-[#999] py-8">
              <p className="text-sm mb-1">AI Email Editor</p>
              <p className="text-[11px]">Describe the email you want to create or how to modify the current one.</p>
            </div>
          )}
          {editorMessages.map((msg, i) => (
            <div key={i} className={cn('mb-3', msg.role === 'user' ? 'text-right' : 'text-left')}>
              <div className={cn(
                'inline-block px-3 py-2 rounded-lg text-xs max-w-[85%]',
                msg.role === 'user'
                  ? 'bg-[#FF4301] text-white'
                  : 'bg-[#f5f5f5] dark:bg-[#222] text-black dark:text-white'
              )}>
                {msg.content}
              </div>
            </div>
          ))}
          {editorLoading && (
            <div className="text-left mb-3">
              <div className="inline-block px-3 py-2 rounded-lg text-xs bg-[#f5f5f5] dark:bg-[#222]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-[#ddd] border-t-[#FF4301] rounded-full animate-spin" />
                  <span className="text-[#888]">Generating...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            value={editorInput}
            onChange={e => setEditorInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditorSend(); } }}
            placeholder="Describe the email you want..."
            className="flex-1 text-xs px-3 py-2 border border-[#ddd] dark:border-[#444] rounded-lg bg-white dark:bg-[#222] text-black dark:text-white resize-none h-10"
            rows={1}
          />
          <button
            onClick={handleEditorSend}
            disabled={editorLoading || !editorInput.trim()}
            className="px-4 py-2 text-[11px] font-medium rounded-lg bg-[#FF4301] text-white hover:bg-[#e63d00] disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* Right: Preview */}
      <div className="w-1/2 flex flex-col">
        <div className={cn(cardClass, 'flex-1 overflow-auto')}>
          {editorHtml ? (
            <iframe
              srcDoc={editorHtml}
              sandbox="allow-same-origin"
              className="w-full h-full border-0"
              title="Email preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#999] text-sm">
              Email preview will appear here
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderCampaigns = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className={sectionHeading}>Campaigns</h3>
        <button
          onClick={() => setShowNewCampaign(!showNewCampaign)}
          className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-black dark:bg-white text-white dark:text-black hover:opacity-80"
        >
          {showNewCampaign ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>

      {/* New Campaign Form */}
      {showNewCampaign && (
        <div className={cn(cardClass, 'p-4 mb-4')}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-[#888] block mb-1">Campaign Name</label>
              <input
                value={campName}
                onChange={e => setCampName(e.target.value)}
                placeholder="e.g. February Newsletter"
                className="w-full text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#888] block mb-1">Template</label>
              <select
                value={campTemplateId}
                onChange={e => setCampTemplateId(e.target.value)}
                className="w-full text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
              >
                <option value="">Select template...</option>
                {templates.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="text-[10px] text-[#888] block mb-1">Subject Override (optional)</label>
            <input
              value={campSubjectOverride}
              onChange={e => setCampSubjectOverride(e.target.value)}
              placeholder="Leave blank to use template subject"
              className="w-full text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
            />
          </div>

          <div className="mb-3">
            <label className="text-[10px] text-[#888] block mb-1.5">Audience</label>
            <div className="flex gap-2 flex-wrap">
              {['all', 'pro', 'free', 'inactive'].map(aud => (
                <button
                  key={aud}
                  onClick={() => setCampAudience(aud)}
                  className={cn(
                    'px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors',
                    campAudience === aud
                      ? 'bg-[#FF4301] text-white'
                      : 'bg-[#f5f5f5] dark:bg-[#222] text-[#666] dark:text-[#888] hover:bg-[#eee] dark:hover:bg-[#333]'
                  )}
                >
                  {aud === 'all' ? 'All Users' : aud === 'pro' ? 'Pro Users' : aud === 'free' ? 'Free Users' : 'Inactive Users'}
                </button>
              ))}
            </div>
            {campAudience === 'inactive' && (
              <div className="mt-2 flex items-center gap-2">
                <label className="text-[10px] text-[#888]">Inactive for</label>
                <input
                  type="number"
                  value={campInactivityDays}
                  onChange={e => setCampInactivityDays(Number(e.target.value))}
                  className="w-16 text-xs px-2 py-1 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white text-center"
                />
                <span className="text-[10px] text-[#888]">days</span>
              </div>
            )}
            {campRecipientCount !== null && (
              <p className="text-[11px] text-[#888] mt-1.5">Estimated recipients: <span className="font-medium text-black dark:text-white">{campRecipientCount.toLocaleString()}</span></p>
            )}
          </div>

          <div className="mb-4">
            <label className="text-[10px] text-[#888] block mb-1.5">Schedule</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCampScheduleNow(true)}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors',
                  campScheduleNow
                    ? 'bg-[#FF4301] text-white'
                    : 'bg-[#f5f5f5] dark:bg-[#222] text-[#666]'
                )}
              >
                Send Now
              </button>
              <button
                onClick={() => setCampScheduleNow(false)}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors',
                  !campScheduleNow
                    ? 'bg-[#FF4301] text-white'
                    : 'bg-[#f5f5f5] dark:bg-[#222] text-[#666]'
                )}
              >
                Schedule
              </button>
              {!campScheduleNow && (
                <input
                  type="datetime-local"
                  value={campScheduleAt}
                  onChange={e => setCampScheduleAt(e.target.value)}
                  className="text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
                />
              )}
            </div>
          </div>

          <button
            onClick={handleCreateCampaign}
            disabled={campCreating || !campName || !campTemplateId}
            className="px-4 py-2 text-xs font-medium rounded-md bg-[#FF4301] text-white hover:bg-[#e63d00] disabled:opacity-50"
          >
            {campCreating ? 'Creating...' : campScheduleNow ? 'Create & Send Now' : 'Schedule Campaign'}
          </button>
        </div>
      )}

      {/* Campaign List */}
      {loading ? <LoadingSpinner /> : (
        <div className={cn(cardClass, 'overflow-hidden')}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#eaeaea] dark:border-[#333] bg-[#fafafa] dark:bg-[#0a0a0a]">
                <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Name</th>
                <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Template</th>
                <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Audience</th>
                <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Status</th>
                <th className="text-right px-3 py-2 text-[10px] font-medium text-[#888]">Sent</th>
                <th className="text-right px-3 py-2 text-[10px] font-medium text-[#888]">Failed</th>
                <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Created</th>
                <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="border-b border-[#eaeaea] dark:border-[#333] last:border-0 hover:bg-[#fafafa] dark:hover:bg-[#0a0a0a]">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-[#888]">{c.template_name || '-'}</td>
                  <td className="px-3 py-2 capitalize">{c.audience}</td>
                  <td className="px-3 py-2">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', statusColors[c.status])}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.sent_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-500">{c.failed_count || ''}</td>
                  <td className="px-3 py-2 text-[#888]">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {(c.status === 'draft' || c.status === 'scheduled') && (
                        <>
                          <button onClick={() => handleSendCampaign(c.id)} className="text-[#FF4301] hover:underline">Send</button>
                          <button onClick={() => handleCancelCampaign(c.id)} className="text-[#999] hover:text-red-500">Cancel</button>
                        </>
                      )}
                      {c.status === 'sent' && (
                        <button onClick={() => { setSendsFilter({ ...sendsFilter, status: '' }); setSendsPage(1); setActiveTab('history'); }} className="text-[#888] hover:text-black dark:hover:text-white">
                          View sends
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-[#999]">No campaigns yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderHistory = () => (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          value={sendsFilter.email}
          onChange={e => setSendsFilter({ ...sendsFilter, email: e.target.value })}
          placeholder="Search by email..."
          className="text-xs px-3 py-1.5 border border-[#ddd] dark:border-[#444] rounded-lg bg-white dark:bg-[#222] text-black dark:text-white w-48"
          onKeyDown={e => { if (e.key === 'Enter') { setSendsPage(1); loadTabData('history'); } }}
        />
        <select
          value={sendsFilter.status}
          onChange={e => { setSendsFilter({ ...sendsFilter, status: e.target.value }); setSendsPage(1); }}
          className="text-xs px-2 py-1.5 border border-[#ddd] dark:border-[#444] rounded bg-white dark:bg-[#222] text-black dark:text-white"
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="bounced">Bounced</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <div className="flex-1" />
        <span className="text-[11px] text-[#888]">{sendsTotal} total sends</span>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          <div className={cn(cardClass, 'overflow-hidden mb-3')}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#eaeaea] dark:border-[#333] bg-[#fafafa] dark:bg-[#0a0a0a]">
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Recipient</th>
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Subject</th>
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Template</th>
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Status</th>
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Sent At</th>
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-[#888]">Error</th>
                </tr>
              </thead>
              <tbody>
                {sends.map(s => (
                  <tr key={s.id} className="border-b border-[#eaeaea] dark:border-[#333] last:border-0 hover:bg-[#fafafa] dark:hover:bg-[#0a0a0a]">
                    <td className="px-3 py-2 font-mono text-[11px]">{s.recipient_email}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{s.subject}</td>
                    <td className="px-3 py-2 text-[#888]">{s.template_name || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={cn('font-medium capitalize', sendStatusColors[s.status])}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#888]">{s.sent_at ? new Date(s.sent_at).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-red-500 max-w-[150px] truncate">{s.error_message || ''}</td>
                  </tr>
                ))}
                {sends.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-[#999]">No sends found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {sendsTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setSendsPage(Math.max(1, sendsPage - 1))}
                disabled={sendsPage <= 1}
                className="px-3 py-1.5 text-[11px] rounded border border-[#ddd] dark:border-[#444] disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-[11px] text-[#888]">Page {sendsPage} of {sendsTotalPages}</span>
              <button
                onClick={() => setSendsPage(Math.min(sendsTotalPages, sendsPage + 1))}
                disabled={sendsPage >= sendsTotalPages}
                className="px-3 py-1.5 text-[11px] rounded border border-[#ddd] dark:border-[#444] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'templates': return renderTemplates();
      case 'editor': return renderEditor();
      case 'campaigns': return renderCampaigns();
      case 'history': return renderHistory();
      default: return null;
    }
  };

  return (
    <AdminLayoutV2>
      <div>
        <h2 className="text-lg font-semibold mb-4">Email Control Center</h2>

        {/* Tab Navigation */}
        <div className="border-b border-[#eaeaea] dark:border-[#333] mb-4">
          <div className="flex gap-0 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#FF4301] text-[#FF4301]'
                    : 'border-transparent text-[#666] dark:text-[#888] hover:text-black dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </AdminLayoutV2>
  );
};

export default AdminEmail;
