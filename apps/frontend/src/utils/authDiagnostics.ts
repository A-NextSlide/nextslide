/**
 * Authentication Diagnostics Utility
 * 
 * This tool helps diagnose authentication issues by checking:
 * - Supabase configuration
 * - Environment variables
 * - OAuth flow status
 * - Session validity
 */

import { supabase } from '@/integrations/supabase/client';

interface DiagnosticResult {
  category: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

interface DiagnosticReport {
  timestamp: string;
  results: DiagnosticResult[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

export class AuthDiagnostics {
  private results: DiagnosticResult[] = [];

  /**
   * Run all diagnostic checks
   */
  async runDiagnostics(): Promise<DiagnosticReport> {
    console.log('[AuthDiagnostics] Starting comprehensive auth diagnostics...');
    this.results = [];

    // Run all checks
    await this.checkEnvironmentVariables();
    await this.checkSupabaseConnection();
    await this.checkCurrentSession();
    await this.checkOAuthConfig();
    await this.checkBrowserStorage();

    // Generate summary
    const summary = {
      passed: this.results.filter(r => r.status === 'pass').length,
      failed: this.results.filter(r => r.status === 'fail').length,
      warnings: this.results.filter(r => r.status === 'warning').length,
    };

    const report: DiagnosticReport = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary,
    };

    // Log report
    console.log('[AuthDiagnostics] Diagnostic Report:', report);
    this.printReport(report);

    return report;
  }

  /**
   * Check environment variables
   */
  private async checkEnvironmentVariables() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      this.results.push({
        category: 'Environment',
        status: 'fail',
        message: 'VITE_SUPABASE_URL is not set',
        details: 'Check your .env file',
      });
    } else if (!supabaseUrl.startsWith('https://')) {
      this.results.push({
        category: 'Environment',
        status: 'fail',
        message: 'VITE_SUPABASE_URL must start with https://',
        details: { currentValue: supabaseUrl },
      });
    } else {
      this.results.push({
        category: 'Environment',
        status: 'pass',
        message: 'VITE_SUPABASE_URL is properly configured',
        details: { url: supabaseUrl },
      });
    }

    if (!supabaseKey) {
      this.results.push({
        category: 'Environment',
        status: 'fail',
        message: 'VITE_SUPABASE_ANON_KEY is not set',
        details: 'Check your .env file',
      });
    } else if (supabaseKey.length < 100) {
      this.results.push({
        category: 'Environment',
        status: 'warning',
        message: 'VITE_SUPABASE_ANON_KEY seems too short',
        details: 'Anon keys are usually longer. Verify this is correct.',
      });
    } else {
      this.results.push({
        category: 'Environment',
        status: 'pass',
        message: 'VITE_SUPABASE_ANON_KEY is set',
      });
    }
  }

  /**
   * Check Supabase connection
   */
  private async checkSupabaseConnection() {
    try {
      // Try to get session (this tests the connection)
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        this.results.push({
          category: 'Connection',
          status: 'fail',
          message: 'Failed to connect to Supabase',
          details: { error: error.message },
        });
      } else {
        this.results.push({
          category: 'Connection',
          status: 'pass',
          message: 'Successfully connected to Supabase',
        });
      }
    } catch (error: any) {
      this.results.push({
        category: 'Connection',
        status: 'fail',
        message: 'Exception while connecting to Supabase',
        details: { error: error.message },
      });
    }
  }

  /**
   * Check current session
   */
  private async checkCurrentSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        this.results.push({
          category: 'Session',
          status: 'warning',
          message: 'Error getting session',
          details: { error: error.message },
        });
      } else if (!session) {
        this.results.push({
          category: 'Session',
          status: 'pass',
          message: 'No active session (not signed in)',
        });
      } else {
        // Check if token is expired
        const expiresAt = session.expires_at || 0;
        const now = Math.floor(Date.now() / 1000);
        const isExpired = expiresAt < now;
        const timeUntilExpiry = expiresAt - now;

        if (isExpired) {
          this.results.push({
            category: 'Session',
            status: 'warning',
            message: 'Session token is expired',
            details: {
              userId: session.user.id,
              email: session.user.email,
              expiresAt: new Date(expiresAt * 1000).toISOString(),
            },
          });
        } else if (timeUntilExpiry < 300) {
          // Less than 5 minutes
          this.results.push({
            category: 'Session',
            status: 'warning',
            message: `Session expires in ${Math.floor(timeUntilExpiry / 60)} minutes`,
            details: {
              userId: session.user.id,
              email: session.user.email,
            },
          });
        } else {
          this.results.push({
            category: 'Session',
            status: 'pass',
            message: 'Active session found',
            details: {
              userId: session.user.id,
              email: session.user.email,
              expiresIn: `${Math.floor(timeUntilExpiry / 60)} minutes`,
            },
          });
        }
      }
    } catch (error: any) {
      this.results.push({
        category: 'Session',
        status: 'fail',
        message: 'Exception while checking session',
        details: { error: error.message },
      });
    }
  }

  /**
   * Check OAuth configuration
   */
  private async checkOAuthConfig() {
    const redirectUrl = `${window.location.origin}/auth-callback`;
    
    // Check if URL is correctly formatted
    if (!redirectUrl.includes('/auth-callback')) {
      this.results.push({
        category: 'OAuth',
        status: 'fail',
        message: 'OAuth redirect URL is malformed',
        details: { redirectUrl },
      });
    } else {
      this.results.push({
        category: 'OAuth',
        status: 'pass',
        message: 'OAuth redirect URL is properly formatted',
        details: { redirectUrl },
      });
    }

    // Check if running on localhost
    if (window.location.origin.includes('localhost')) {
      this.results.push({
        category: 'OAuth',
        status: 'warning',
        message: 'Running on localhost - ensure this URL is whitelisted in Supabase',
        details: { 
          currentOrigin: window.location.origin,
          requiredInSupabase: `${window.location.origin}/auth-callback`,
        },
      });
    }

    // Check if URL has trailing slash
    if (window.location.pathname.endsWith('/') && window.location.pathname !== '/') {
      this.results.push({
        category: 'OAuth',
        status: 'warning',
        message: 'Current URL has trailing slash - this might cause redirect issues',
      });
    }
  }

  /**
   * Check browser storage
   */
  private async checkBrowserStorage() {
    try {
      // Check localStorage
      const localStorageWorks = this.testStorage('localStorage');
      if (!localStorageWorks) {
        this.results.push({
          category: 'Storage',
          status: 'fail',
          message: 'localStorage is not available or disabled',
          details: 'Supabase requires localStorage for session persistence',
        });
      } else {
        this.results.push({
          category: 'Storage',
          status: 'pass',
          message: 'localStorage is working',
        });
      }

      // Check sessionStorage
      const sessionStorageWorks = this.testStorage('sessionStorage');
      if (!sessionStorageWorks) {
        this.results.push({
          category: 'Storage',
          status: 'warning',
          message: 'sessionStorage is not available',
        });
      }

      // Check for auth-related items in storage
      const authKeys = Object.keys(localStorage).filter(key => 
        key.includes('supabase') || key.includes('auth')
      );

      if (authKeys.length > 0) {
        this.results.push({
          category: 'Storage',
          status: 'pass',
          message: `Found ${authKeys.length} auth-related items in storage`,
          details: { keys: authKeys },
        });
      }
    } catch (error: any) {
      this.results.push({
        category: 'Storage',
        status: 'fail',
        message: 'Exception while checking browser storage',
        details: { error: error.message },
      });
    }
  }

  /**
   * Test if a storage mechanism works
   */
  private testStorage(type: 'localStorage' | 'sessionStorage'): boolean {
    try {
      const storage = type === 'localStorage' ? window.localStorage : window.sessionStorage;
      const testKey = '__test__';
      storage.setItem(testKey, 'test');
      const value = storage.getItem(testKey);
      storage.removeItem(testKey);
      return value === 'test';
    } catch {
      return false;
    }
  }

  /**
   * Print a formatted report to console
   */
  private printReport(report: DiagnosticReport) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 AUTHENTICATION DIAGNOSTICS REPORT');
    console.log('='.repeat(60));
    console.log(`Generated: ${new Date(report.timestamp).toLocaleString()}`);
    console.log(`\n📊 Summary:`);
    console.log(`  ✅ Passed: ${report.summary.passed}`);
    console.log(`  ❌ Failed: ${report.summary.failed}`);
    console.log(`  ⚠️  Warnings: ${report.summary.warnings}`);
    console.log('\n📋 Detailed Results:\n');

    // Group by category
    const byCategory = report.results.reduce((acc, result) => {
      if (!acc[result.category]) acc[result.category] = [];
      acc[result.category].push(result);
      return acc;
    }, {} as Record<string, DiagnosticResult[]>);

    Object.entries(byCategory).forEach(([category, results]) => {
      console.log(`\n${category}:`);
      results.forEach(result => {
        const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️ ';
        console.log(`  ${icon} ${result.message}`);
        if (result.details) {
          console.log(`     Details:`, result.details);
        }
      });
    });

    console.log('\n' + '='.repeat(60));

    // Provide recommendations
    if (report.summary.failed > 0) {
      console.log('\n🔧 RECOMMENDED ACTIONS:\n');
      report.results
        .filter(r => r.status === 'fail')
        .forEach(r => {
          console.log(`  • ${r.message}`);
          if (r.details) console.log(`    → ${JSON.stringify(r.details)}`);
        });
      console.log('\n📖 See SUPABASE_AUTH_FIX.md for detailed fixing instructions');
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }
}

/**
 * Run diagnostics from browser console
 * Usage: window.runAuthDiagnostics()
 */
export function setupDiagnostics() {
  if (typeof window !== 'undefined') {
    (window as any).runAuthDiagnostics = async () => {
      const diagnostics = new AuthDiagnostics();
      return await diagnostics.runDiagnostics();
    };
    console.log('💡 Auth diagnostics ready! Run window.runAuthDiagnostics() to check your auth configuration.');
  }
}

// Auto-setup in development
if (import.meta.env.DEV) {
  setupDiagnostics();
}

