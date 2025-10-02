import React, { useState } from 'react';
import { useRegistry } from '../context/RegistryContext';
import { ArrowUpCircle, XCircle, CloudUpload, CheckCircle } from 'lucide-react';

interface RegistryViewerProps {
  showComponents?: boolean;
  showGlobal?: boolean;
  className?: string;
}

/**
 * Component to view the current registry data
 */
const RegistryViewer: React.FC<RegistryViewerProps> = ({
  showComponents = true,
  showGlobal = true,
  className = '',
}) => {
  const { registry, loading, error, sendRegistryToServer } = useRegistry();
  const [sendingRegistry, setSendingRegistry] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<boolean | null>(null);
  const [sendMessage, setSendMessage] = useState<string>('');

  const handleSendRegistry = async () => {
    // Don't send if already sending
    if (sendingRegistry) {
      return;
    }
    
    try {
      setSendingRegistry(true);
      setSendSuccess(null);
      setSendMessage('');
      
      const result = await sendRegistryToServer();
      
      // Check if the result has status property (indicates it came from our skip logic)
      if (result && typeof result === 'object' && 'status' in result && result.status === 'skipped') {
        setSendMessage((result as any).message || 'Operation skipped');
        setSendSuccess(true);
      } else {
        setSendMessage('Registry successfully sent to backend!');
        setSendSuccess(true);
      }
      
      // Clear the success indicator after 3 seconds
      setTimeout(() => {
        setSendSuccess(null);
        setSendMessage('');
      }, 3000);
    } catch (err) {
      console.error('Error sending registry:', err);
      setSendSuccess(false);
      setSendMessage(err instanceof Error ? err.message : 'Failed to send registry');
    } finally {
      setSendingRegistry(false);
    }
  };

  if (loading) {
    return <div className={`registry-viewer ${className}`}>Loading registry data...</div>;
  }

  if (error) {
    return <div className={`registry-viewer error ${className}`}>Error: {error}</div>;
  }

  if (!registry) {
    return <div className={`registry-viewer ${className}`}>No registry data available.</div>;
  }

  return (
    <div className={`registry-viewer ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Registry Data</h2>
        
        <button
          className={`flex items-center gap-1 px-3 py-1.5 rounded ${
            sendingRegistry || loading
              ? 'bg-gray-200 text-gray-600 cursor-wait' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          onClick={handleSendRegistry}
          disabled={sendingRegistry || loading}
        >
          {sendingRegistry ? (
            <>Loading...</>
          ) : (
            <>
              <CloudUpload size={16} />
              Send to Backend
            </>
          )}
        </button>
      </div>
      
      {/* Send Status Indicator */}
      {sendSuccess !== null && (
        <div className={`mb-4 p-2 rounded flex items-center gap-2 ${
          sendSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {sendSuccess ? (
            <>
              <CheckCircle size={18} className="text-green-600" />
              <span>{sendMessage || 'Registry successfully sent to backend!'}</span>
            </>
          ) : (
            <>
              <XCircle size={18} className="text-red-600" />
              <span>{sendMessage || 'Failed to send registry to backend'}</span>
            </>
          )}
        </div>
      )}
      
      {showComponents && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Components ({Object.keys(registry.components).length})</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(registry.components).map(([key, component]) => (
              <div key={key} className="border p-3 rounded shadow-sm hover:shadow-md transition-shadow">
                <div className="font-medium">{component.name}</div>
                <div className="text-sm text-gray-500">{component.type}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {showGlobal && (
        <div>
          <h3 className="text-lg font-semibold mb-2">Global Properties ({Object.keys(registry.global).length})</h3>
          <div className="space-y-2">
            {Object.entries(registry.global).map(([key, prop]) => (
              <div key={key} className="border p-3 rounded shadow-sm">
                <div className="font-medium">{key}</div>
                <div className="text-sm text-gray-500">Type: {(prop as any).type}</div>
                <div className="text-sm text-gray-500">
                  Default: {
                    typeof (prop as any).default === 'object' 
                      ? JSON.stringify((prop as any).default)
                      : String((prop as any).default)
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RegistryViewer; 