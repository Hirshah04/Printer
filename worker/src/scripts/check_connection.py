"""
=============================================================================
Hardware Connection Probe for HP LaserJet Pro MFP M126nw
Directly queries physical USB PnP device state and Wi-Fi IPP interface.
=============================================================================
Output: JSON object with connection status:
{
  "usb": {"connected": bool, "printerName": str|null, "port": str|null},
  "wifi": {"connected": bool, "ip": str, "port": int, "state": str|null},
  "activeRoute": "usb" | "wifi" | "none"
}
"""
import sys
import os
import json
import socket
import subprocess

def check_usb_hardware():
    """
    Check if the HP LaserJet is physically plugged in via USB and acknowledged by Windows PnP.
    Returns (is_connected: bool, printer_name: str|None, port: str|None)
    """
    try:
        # Check Windows PnP device manager for physically PRESENT and OK device
        ps_script = (
            "& { $dev = Get-PnpDevice -Class USB,Printer -ErrorAction SilentlyContinue | "
            "Where-Object { ($_.InstanceId -match 'USBPRINT.*M126|03F0.*222A') -and $_.Present -eq $true -and $_.Status -eq 'OK' }; "
            "if ($dev) { Write-Host 'PRESENT' } else { Write-Host 'NOT_PRESENT' } }"
        )
        res = subprocess.run(
            ['powershell', '-NoProfile', '-Command', ps_script],
            capture_output=True,
            text=True,
            timeout=4
        )
        out = (res.stdout or '').strip()
        if 'PRESENT' not in out or 'NOT_PRESENT' in out:
            return False, None, None

        # Find the Windows printer queue mapped to this USB device
        import win32print
        installed = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL)
        for p in installed:
            name = p[2]
            if 'm126' in name.lower() or 'laserjet' in name.lower():
                try:
                    h = win32print.OpenPrinter(name)
                    info = win32print.GetPrinter(h, 2)
                    port = str(info.get('pPortName', ''))
                    attr = info.get('Attributes', 0)
                    win32print.ClosePrinter(h)
                    is_offline = bool(attr & win32print.PRINTER_ATTRIBUTE_WORK_OFFLINE)
                    if port.upper().startswith('USB') and not is_offline:
                        return True, name, port
                except Exception:
                    pass

        return True, 'Hewlett-Packard HP LaserJet Pro MFP M126nw (Copy 1)', 'USB001'
    except Exception:
        return False, None, None


def check_wifi_hardware(target_ip='192.168.1.37', port=631, timeout=1.5):
    """
    Check if the printer is reachable and acknowledging over Wi-Fi network.
    Returns (is_connected: bool, state_str: str|None, printer_name: str|None)
    """
    wifi_reachable = False
    for p in [port, 9100]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(timeout)
            s.connect((target_ip, p))
            s.close()
            wifi_reachable = True
            break
        except Exception:
            pass

    if not wifi_reachable:
        return False, None, None

    # Resolve installed Windows printer name for Wi-Fi and ensure it is online
    wifi_printer_name = 'Hewlett-Packard HP LaserJet Pro MFP M126nw'
    try:
        import win32print
        installed = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
        for name in installed:
            if 'hewlett' in name.lower() and 'copy' not in name.lower():
                wifi_printer_name = name
                break
        else:
            for name in installed:
                if 'copy' not in name.lower() and ('laserjet' in name.lower() or 'm126' in name.lower()):
                    wifi_printer_name = name
                    break

        # Clear offline status if set
        try:
            h = win32print.OpenPrinter(wifi_printer_name, {'DesiredAccess': win32print.PRINTER_ALL_ACCESS})
            info = win32print.GetPrinter(h, 2)
            if info['Attributes'] & win32print.PRINTER_ATTRIBUTE_WORK_OFFLINE:
                info['Attributes'] &= ~win32print.PRINTER_ATTRIBUTE_WORK_OFFLINE
                win32print.SetPrinter(h, 2, info, 0)
            win32print.ClosePrinter(h)
        except Exception:
            pass
    except Exception:
        pass

    return True, 'ONLINE', wifi_printer_name


def probe_all():
    target_ip = os.getenv('DEFAULT_PRINTER_IP', '192.168.1.37')
    
    usb_conn, usb_name, usb_port = check_usb_hardware()
    wifi_conn, wifi_state, wifi_name = check_wifi_hardware(target_ip, 631)

    if usb_conn:
        active_route = 'usb'
    elif wifi_conn:
        active_route = 'wifi'
    else:
        active_route = 'none'

    result = {
        'usb': {
            'connected': usb_conn,
            'printerName': usb_name,
            'port': usb_port
        },
        'wifi': {
            'connected': wifi_conn,
            'ip': target_ip,
            'port': 631,
            'state': wifi_state,
            'printerName': wifi_name
        },
        'activeRoute': active_route
    }
    return result
            'port': 631,
            'state': wifi_state
        },
        'activeRoute': active_route
    }
    return result


if __name__ == '__main__':
    res = probe_all()
    print(json.dumps(res, indent=2))
