//! Hardware printer service supporting Windows Print Spooler (RAW) and TCP network printers.

use pos_core::hardware::{EscPosGenerator, ReceiptPayload, ReceiptWidth};
use std::io::{Error, ErrorKind, Result};
#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
mod win_spooler {
    use std::ffi::OsStr;
    use std::io::{Error, Result};
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    #[repr(C)]
    struct DocInfo1W {
        p_doc_name: *const u16,
        p_output_file: *const u16,
        p_data_type: *const u16,
    }

    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterW(
            p_printer_name: *const u16,
            ph_printer: *mut *mut std::ffi::c_void,
            p_default: *const std::ffi::c_void,
        ) -> i32;

        fn StartDocPrinterW(
            h_printer: *mut std::ffi::c_void,
            level: u32,
            p_doc_info: *const DocInfo1W,
        ) -> u32;

        fn StartPagePrinter(h_printer: *mut std::ffi::c_void) -> i32;

        fn WritePrinter(
            h_printer: *mut std::ffi::c_void,
            p_buf: *const u8,
            cb_buf: u32,
            pc_written: *mut u32,
        ) -> i32;

        fn EndPagePrinter(h_printer: *mut std::ffi::c_void) -> i32;
        fn EndDocPrinter(h_printer: *mut std::ffi::c_void) -> i32;
        fn ClosePrinter(h_printer: *mut std::ffi::c_void) -> i32;

        fn GetDefaultPrinterW(psz_buffer: *mut u16, pcch_buffer: *mut u32) -> i32;
    }

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn get_default_printer() -> Option<String> {
        unsafe {
            let mut size: u32 = 0;
            GetDefaultPrinterW(ptr::null_mut(), &mut size);
            if size == 0 {
                return None;
            }
            let mut buf = vec![0u16; size as usize];
            if GetDefaultPrinterW(buf.as_mut_ptr(), &mut size) != 0 {
                if let Some(pos) = buf.iter().position(|&c| c == 0) {
                    buf.truncate(pos);
                }
                return String::from_utf16(&buf).ok();
            }
            None
        }
    }

    pub fn send_raw_bytes(printer_name: &str, doc_title: &str, bytes: &[u8]) -> Result<()> {
        let wide_name = to_wide(printer_name);
        let wide_doc = to_wide(doc_title);
        let wide_raw = to_wide("RAW");

        unsafe {
            let mut h_printer: *mut std::ffi::c_void = ptr::null_mut();
            if OpenPrinterW(wide_name.as_ptr(), &mut h_printer, ptr::null()) == 0 {
                return Err(Error::last_os_error());
            }

            let doc_info = DocInfo1W {
                p_doc_name: wide_doc.as_ptr(),
                p_output_file: ptr::null(),
                p_data_type: wide_raw.as_ptr(),
            };

            let job_id = StartDocPrinterW(h_printer, 1, &doc_info);
            if job_id == 0 {
                let err = Error::last_os_error();
                ClosePrinter(h_printer);
                return Err(err);
            }

            if StartPagePrinter(h_printer) == 0 {
                let err = Error::last_os_error();
                EndDocPrinter(h_printer);
                ClosePrinter(h_printer);
                return Err(err);
            }

            let mut written: u32 = 0;
            let success = WritePrinter(
                h_printer,
                bytes.as_ptr(),
                bytes.len() as u32,
                &mut written,
            );

            EndPagePrinter(h_printer);
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);

            if success == 0 {
                return Err(Error::last_os_error());
            }

            Ok(())
        }
    }
}

pub fn list_system_printers() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let list: Vec<String> = stdout
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                if !list.is_empty() {
                    return list;
                }
            }
        }
    }

    vec!["Default Printer".to_string()]
}

pub fn print_bytes(printer_target: Option<&str>, #[allow(unused_variables)] doc_title: &str, bytes: &[u8]) -> Result<()> {
    // "Default Printer" is the placeholder shown when no printers were found.
    let target = printer_target.filter(|t| !t.trim().is_empty() && *t != "Default Printer");

    // 1. If target is network IP/Port e.g. "192.168.1.100:9100" or starts with "tcp://"
    if let Some(dest) = target {
        if dest.starts_with("tcp://") || (dest.contains('.') && dest.contains(':')) {
            use std::io::Write;
            use std::net::TcpStream;
            use std::time::Duration;

            let clean_dest = if dest.starts_with("tcp://") {
                &dest[6..]
            } else {
                dest
            };

            let socket_addr = if !clean_dest.contains(':') {
                format!("{}:9100", clean_dest)
            } else {
                clean_dest.to_string()
            };

            let addr: std::net::SocketAddr = socket_addr
                .parse()
                .map_err(|e| Error::new(ErrorKind::InvalidInput, e))?;
            // Only printers on the shop's own network, on the usual raw-print ports.
            let local = match addr.ip() {
                std::net::IpAddr::V4(ip) => ip.is_private() || ip.is_loopback() || ip.is_link_local(),
                std::net::IpAddr::V6(ip) => ip.is_loopback(),
            };
            if !local || !(9100..=9102).contains(&addr.port()) {
                return Err(Error::new(
                    ErrorKind::PermissionDenied,
                    "Network printers must be on the local network (port 9100-9102)",
                ));
            }
            let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(3))?;
            stream.write_all(bytes)?;
            stream.flush()?;
            return Ok(());
        }
    }

    // 2. Windows raw print spooler
    #[cfg(target_os = "windows")]
    {
        let printer_name = match target {
            Some(name) => name.to_string(),
            None => win_spooler::get_default_printer()
                .ok_or_else(|| Error::new(ErrorKind::NotFound, "No default printer found"))?,
        };

        win_spooler::send_raw_bytes(&printer_name, doc_title, bytes)?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err(Error::new(ErrorKind::Unsupported, "Printing is only supported on Windows"))
    }
}

pub fn kick_drawer(printer_target: Option<&str>) -> Result<()> {
    // ESC p 0 25 250 (0x1B, 0x70, 0x00, 0x19, 0xFA)
    let pulse = [0x1B, 0x70, 0x00, 0x19, 0xFA];
    print_bytes(printer_target, "Cash Drawer Kick", &pulse)
}

pub fn cut_paper(printer_target: Option<&str>) -> Result<()> {
    // 3 line feeds + GS V 66 0
    let cut = [0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00];
    print_bytes(printer_target, "Paper Cut", &cut)
}

pub fn print_sale_receipt(
    printer_target: Option<&str>,
    width: ReceiptWidth,
    payload: &ReceiptPayload,
) -> Result<()> {
    let mut gen = EscPosGenerator::new(width);
    let bytes = gen.generate_sale_receipt(payload).to_vec();
    print_bytes(printer_target, &format!("Receipt {}", payload.invoice_no), &bytes)
}
