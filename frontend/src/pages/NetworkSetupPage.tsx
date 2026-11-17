import React, { useState, useEffect } from 'react';
import { networkService } from '../services/api';
import {
  Network,
  Shield,
  Wifi,
  Server,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';

export const NetworkSetupPage: React.FC = () => {
  const [selectedBrand, setSelectedBrand] = useState<string>('asus');
  const [guideData, setGuideData] = useState<any>(null);
  const [networkConfig, setNetworkConfig] = useState<any>(null);
  const [testIp, setTestIp] = useState<string>('192.168.1.150');
  const [diagResult, setDiagResult] = useState<any>(null);
  const [copiedConf, setCopiedConf] = useState(false);

  useEffect(() => {
    networkService.getConfig().then((res) => {
      setNetworkConfig(res);
      if (res.printers && res.printers[0]) {
        setTestIp(res.printers[0].lanIp);
      }
    });
  }, []);

  useEffect(() => {
    networkService.getGuide(selectedBrand).then((res) => {
      setGuideData(res.guide);
    });
  }, [selectedBrand]);

  const handleRunDiagnostic = async () => {
    try {
      const res = await networkService.runDiagnostics(testIp);
      setDiagResult(res.diagnostics);
    } catch (err: any) {
      alert(err.message || 'Diagnostic failed');
    }
  };

  const sampleWireGuardConf = `[Interface]
# Cloud Print Worker's WireGuard IP within the VPN subnet
Address = 10.14.0.2/24
PrivateKey = <CLIENT_PRIVATE_KEY_GENERATED_ON_WORKER>
DNS = 1.1.1.1

[Peer]
# Router WireGuard Server Public Key
PublicKey = <ROUTER_WIREGUARD_SERVER_PUBLIC_KEY>
# Router Public IP or DDNS (e.g., yourname.asuscomm.com:51820)
Endpoint = ${networkConfig?.config?.vpnServerAddress || 'your-ddns-or-wan-ip.example.com'}:51820
# Route only VPN traffic and the printer's LAN subnet
AllowedIPs = 10.14.0.0/24, ${networkConfig?.config?.lanSubnet || '192.168.1.0/24'}
PersistentKeepalive = 25`;

  const copyConfig = () => {
    navigator.clipboard.writeText(sampleWireGuardConf);
    setCopiedConf(true);
    setTimeout(() => setCopiedConf(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Network className="h-6 w-6 text-brand-400" />
          Router & Network Architecture Setup
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Configure your home/office router to securely bridge the Cloud Print Worker with your HP LaserJet Pro MFP M126nw.
        </p>
      </div>

      {/* Critical IP Notice: Wi-Fi Direct vs LAN IP */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-950/40 to-slate-900 border border-amber-500/40 space-y-3">
        <div className="flex items-center gap-2.5 text-amber-400 font-bold text-base">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Important Note: Printer IP Detection & HP Wi-Fi Direct
        </div>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          The address <code className="bg-slate-800 px-2 py-0.5 rounded text-amber-300 font-mono">192.168.223.1</code> is HP's factory default Wireless Direct SoftAP address used for peer-to-peer laptop connections.
          <strong className="text-white block mt-1">
            When connecting over a router VPN, the printer must be connected to your Wi-Fi router, and you must use its router-assigned LAN IP (e.g. 192.168.1.x or 192.168.0.x).
          </strong>
        </p>
        <div className="pt-2 flex flex-col sm:flex-row gap-3 items-center">
          <div className="w-full sm:w-auto flex-1 flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">Verify IP Address:</span>
            <input
              type="text"
              value={testIp}
              onChange={(e) => setTestIp(e.target.value)}
              placeholder="e.g. 192.168.1.150"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={handleRunDiagnostic}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-all shadow-md shadow-amber-600/20"
          >
            Run IP Check
          </button>
        </div>

        {diagResult?.printerIpAnalysis && (
          <div className={`mt-3 p-3 rounded-xl text-xs space-y-1 ${
            diagResult.printerIpAnalysis.isLanIp
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            <div className="font-bold flex items-center gap-1.5">
              {diagResult.printerIpAnalysis.isLanIp ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {diagResult.printerIpAnalysis.detectedType}
            </div>
            {diagResult.printerIpAnalysis.warning && <p>{diagResult.printerIpAnalysis.warning}</p>}
            {diagResult.printerIpAnalysis.actionRequired && (
              <p className="text-slate-300 mt-1 font-semibold">{diagResult.printerIpAnalysis.actionRequired}</p>
            )}
          </div>
        )}
      </div>

      {/* Router Brand Selector & Step-by-Step Guide */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
        <div>
          <h3 className="font-bold text-lg text-white flex items-center gap-2">
            <Wifi className="h-5 w-5 text-brand-400" />
            Router Configuration Guide
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select your router brand to view tailored WireGuard VPN and DHCP reservation instructions
          </p>
        </div>

        {/* Brand Selector Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { id: 'asus', label: 'ASUS (AsusWRT)' },
            { id: 'openwrt', label: 'OpenWrt' },
            { id: 'tplink', label: 'TP-Link' },
            { id: 'glinet', label: 'GL.iNet' },
            { id: 'generic', label: 'Generic / Other' },
          ].map((brand) => (
            <button
              key={brand.id}
              onClick={() => setSelectedBrand(brand.id)}
              className={`p-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                selectedBrand === brand.id
                  ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20'
                  : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {brand.label}
            </button>
          ))}
        </div>

        {/* Active Guide Content */}
        {guideData && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-white text-base">{guideData.brand}</h4>
              <div className="flex gap-2 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  WireGuard: {guideData.wireguardSupport}
                </span>
              </div>
            </div>

            <ol className="space-y-2.5 list-decimal list-inside text-xs sm:text-sm text-slate-300">
              {guideData.steps.map((step: string, idx: number) => (
                <li key={idx} className="leading-relaxed pl-1 marker:text-brand-400 marker:font-bold">
                  {step}
                </li>
              ))}
            </ol>

            {/* DDNS & CGNAT Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <span className="font-semibold text-white block mb-1">Dynamic DNS (DDNS)</span>
                <span className="text-slate-400">{guideData.ddns}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <span className="font-semibold text-white block mb-1">CGNAT / Public IP Check</span>
                <span className="text-slate-400">{guideData.cgnatNote}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WireGuard Client Configuration Sample */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Terminal className="h-5 w-5 text-brand-400" />
              Cloud Worker WireGuard Client Configuration Template (<code className="text-xs font-mono text-brand-300">wg0.conf</code>)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Place this configuration in your Cloud Print Worker's <code className="text-slate-300">/etc/wireguard/wg0.conf</code>
            </p>
          </div>
          <button
            onClick={copyConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
          >
            {copiedConf ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedConf ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono overflow-x-auto leading-relaxed">
          {sampleWireGuardConf}
        </pre>

        <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700 text-xs text-slate-400 flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Security Notice: Never commit or share your private keys. Only the public key is registered with the router.</span>
        </div>
      </div>
    </div>
  );
};
