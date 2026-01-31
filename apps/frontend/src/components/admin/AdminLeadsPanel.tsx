import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Download,
  RefreshCw,
  Mail,
  Calendar,
  FileStack,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { adminApi, ShareViewer } from '@/services/adminApi';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 50;

const AdminLeadsPanel: React.FC = () => {
  const [viewers, setViewers] = useState<ShareViewer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchViewers = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getShareViewers({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        search: debouncedSearch || undefined,
        sortBy: 'registered_at',
        sortOrder: 'desc',
      });
      setViewers(response.viewers);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Error fetching viewers:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load collected emails',
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch]);

  useEffect(() => {
    fetchViewers();
  }, [fetchViewers]);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const blob = await adminApi.exportShareViewers(debouncedSearch || undefined);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export complete',
        description: `Exported ${total} leads to CSV`,
      });
    } catch (error) {
      console.error('Error exporting:', error);
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: 'Could not export leads to CSV',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const refresh = () => {
    setCurrentPage(1);
    fetchViewers();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-black dark:text-white">Collected Leads</h2>
          <p className="text-sm text-[#666] dark:text-[#888] mt-1">
            Emails collected from share link viewers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
            className="h-8"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={isExporting || total === 0}
            className="h-8 bg-black hover:bg-black/90 text-white"
          >
            <Download className={cn("h-3.5 w-3.5 mr-1.5", isExporting && "animate-pulse")} />
            {isExporting ? 'Exporting...' : `Export CSV (${total})`}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333]">
          <div className="flex items-center gap-2 text-[#666] dark:text-[#888] text-xs mb-1">
            <Mail className="h-3.5 w-3.5" />
            Total Leads
          </div>
          <div className="text-2xl font-semibold">{total}</div>
        </div>
        <div className="p-4 rounded-lg bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333]">
          <div className="flex items-center gap-2 text-[#666] dark:text-[#888] text-xs mb-1">
            <Calendar className="h-3.5 w-3.5" />
            Showing
          </div>
          <div className="text-2xl font-semibold">{viewers.length}</div>
        </div>
        <div className="p-4 rounded-lg bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333]">
          <div className="flex items-center gap-2 text-[#666] dark:text-[#888] text-xs mb-1">
            <FileStack className="h-3.5 w-3.5" />
            Pages
          </div>
          <div className="text-2xl font-semibold">{currentPage} / {totalPages}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666]" />
        <Input
          placeholder="Search by email, name, or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 bg-white dark:bg-[#111]"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#111] overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-[#fafafa] dark:bg-[#0a0a0a] border-b border-[#eaeaea] dark:border-[#333] text-xs font-medium text-[#666] dark:text-[#888]">
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Name</div>
          <div className="col-span-2">Company</div>
          <div className="col-span-3">Deck</div>
          <div className="col-span-2">Registered</div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-[#eaeaea] dark:divide-[#333]">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="grid grid-cols-12 gap-4 px-4 py-3">
                <div className="col-span-3"><Skeleton className="h-4 w-full" /></div>
                <div className="col-span-2"><Skeleton className="h-4 w-3/4" /></div>
                <div className="col-span-2"><Skeleton className="h-4 w-3/4" /></div>
                <div className="col-span-3"><Skeleton className="h-4 w-full" /></div>
                <div className="col-span-2"><Skeleton className="h-4 w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : viewers.length === 0 ? (
          <div className="px-4 py-12 text-center text-[#666] dark:text-[#888]">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {debouncedSearch ? 'No leads match your search' : 'No leads collected yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#eaeaea] dark:divide-[#333]">
            {viewers.map((viewer) => (
              <div
                key={viewer.id}
                className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-[#fafafa] dark:hover:bg-[#0a0a0a] transition-colors"
              >
                <div className="col-span-3 flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300 shrink-0">
                    {viewer.email.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm truncate" title={viewer.email}>
                    {viewer.email}
                  </span>
                </div>
                <div className="col-span-2 flex items-center text-sm text-[#666] dark:text-[#888]">
                  {viewer.name || <span className="text-[#999]">&mdash;</span>}
                </div>
                <div className="col-span-2 flex items-center text-sm text-[#666] dark:text-[#888]">
                  {viewer.company || <span className="text-[#999]">&mdash;</span>}
                </div>
                <div className="col-span-3 flex items-center gap-1.5 min-w-0">
                  <FileStack className="h-3.5 w-3.5 text-[#999] shrink-0" />
                  <span className="text-sm text-[#666] dark:text-[#888] truncate" title={viewer.deck_name || 'Unknown deck'}>
                    {viewer.deck_name || <span className="text-[#999]">Unknown</span>}
                  </span>
                </div>
                <div className="col-span-2 flex items-center text-xs text-[#666] dark:text-[#888]">
                  {formatDistanceToNow(new Date(viewer.registered_at), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-[#666] dark:text-[#888]">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isLoading}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm text-[#666]">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || isLoading}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLeadsPanel;
