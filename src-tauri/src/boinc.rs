//! Read-only status from a locally running BOINC client (https://boinc.berkeley.edu).
//!
//! Volunteer computing is done by BOINC itself, not by this app: the user installs BOINC and
//! attaches it to a research project (we suggest climateprediction.net). BOINC computes while the
//! computer is idle, which is exactly when the screensaver is up, so the saver can show what this
//! machine is contributing.
//!
//! We speak BOINC's GUI RPC protocol on 127.0.0.1:31416 and use only read-only requests that the
//! client answers for local connections without authentication. We never read BOINC's password
//! file, never attach or detach projects, and never change BOINC settings.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

pub const DEFAULT_ADDR: &str = "127.0.0.1:31416";
const TIMEOUT: Duration = Duration::from_millis(1500);
const MAX_REPLY: usize = 4 * 1024 * 1024;
const END: u8 = 0x03;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub master_url: String,
    /// Credit granted to this computer by the project (validated work only).
    pub host_total_credit: f64,
    pub host_expavg_credit: f64,
    pub suspended: bool,
    pub tasks_running: u32,
    pub tasks_queued: u32,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum Status {
    /// Nothing listening on the GUI RPC port.
    NotRunning,
    /// Something answered but it isn't a BOINC client we understand, or it asked for auth.
    Unavailable { reason: String },
    Running {
        version: Option<String>,
        /// BOINC's own run mode: "always", "auto" (default: compute when idle), "never".
        task_mode: Option<String>,
        /// BOINC's reason for not computing right now, if any (0 = computing).
        suspend_reason: Option<u32>,
        projects: Vec<Project>,
    },
}

fn request(addr: &SocketAddr, body: &str) -> std::io::Result<String> {
    let mut s = TcpStream::connect_timeout(addr, TIMEOUT)?;
    s.set_read_timeout(Some(TIMEOUT))?;
    s.set_write_timeout(Some(TIMEOUT))?;
    let msg = format!("<boinc_gui_rpc_request>\n{body}\n</boinc_gui_rpc_request>\n\x03");
    s.write_all(msg.as_bytes())?;
    let mut out = Vec::new();
    let mut buf = [0u8; 16 * 1024];
    loop {
        let n = s.read(&mut buf)?;
        if n == 0 {
            break;
        }
        out.extend_from_slice(&buf[..n]);
        if out.last() == Some(&END) {
            out.pop();
            break;
        }
        if out.len() > MAX_REPLY {
            return Err(std::io::Error::other("reply too large"));
        }
    }
    Ok(String::from_utf8_lossy(&out).into_owned())
}

fn child_text<'a>(n: roxmltree::Node<'a, 'a>, tag: &str) -> Option<&'a str> {
    n.children().find(|c| c.has_tag_name(tag)).and_then(|c| c.text()).map(str::trim)
}

fn has_child(n: roxmltree::Node, tag: &str) -> bool {
    n.children().any(|c| c.has_tag_name(tag))
}

fn num(n: roxmltree::Node, tag: &str) -> f64 {
    child_text(n, tag).and_then(|t| t.parse().ok()).filter(|v: &f64| v.is_finite()).unwrap_or(0.0)
}

/// BOINC replies are XML but older clients emit a few bare entities and unescaped `&` in
/// project names; repair the common case so one bad name doesn't hide everything.
fn sanitize(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len());
    let mut rest = xml;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        let is_entity = tail[1..]
            .find(';')
            .is_some_and(|j| j > 0 && j < 10 && tail[1..1 + j].chars().all(|c| c.is_ascii_alphanumeric() || c == '#'));
        out.push_str(if is_entity { "&" } else { "&amp;" });
        rest = &tail[1..];
    }
    out.push_str(rest);
    out
}

fn parse_reply(xml: &str) -> Result<roxmltree::Document<'_>, String> {
    roxmltree::Document::parse(xml).map_err(|e| format!("unreadable reply: {e}"))
}

/// Parse a `get_simple_gui_info` reply into projects with their task counts.
pub fn parse_simple_gui_info(xml: &str) -> Result<Vec<Project>, String> {
    let clean = sanitize(xml);
    let doc = parse_reply(&clean)?;
    let root = doc.root_element();
    if root.descendants().any(|n| n.has_tag_name("unauthorized")) {
        return Err("BOINC asked for authorization".into());
    }
    let mut projects: Vec<Project> = root
        .descendants()
        .filter(|n| n.has_tag_name("project"))
        .map(|p| Project {
            name: child_text(p, "project_name").unwrap_or("").to_string(),
            master_url: child_text(p, "master_url").unwrap_or("").to_string(),
            host_total_credit: num(p, "host_total_credit"),
            host_expavg_credit: num(p, "host_expavg_credit"),
            suspended: has_child(p, "suspended_via_gui"),
            tasks_running: 0,
            tasks_queued: 0,
        })
        .filter(|p| !p.master_url.is_empty())
        .collect();
    for r in root.descendants().filter(|n| n.has_tag_name("result")) {
        let url = child_text(r, "project_url").unwrap_or("");
        let Some(p) = projects.iter_mut().find(|p| p.master_url == url) else { continue };
        // A result with an <active_task> whose scheduler_state is 2 is executing now.
        let running = r
            .children()
            .find(|c| c.has_tag_name("active_task"))
            .is_some_and(|a| child_text(a, "scheduler_state") == Some("2"));
        // ready_to_report / state>=3 means computation finished; don't count it as queued.
        let done = has_child(r, "ready_to_report") || child_text(r, "state").and_then(|s| s.parse::<u32>().ok()).is_some_and(|s| s >= 3);
        if running {
            p.tasks_running += 1;
        } else if !done {
            p.tasks_queued += 1;
        }
    }
    Ok(projects)
}

/// Parse `get_cc_status`: (task_mode, suspend_reason).
pub fn parse_cc_status(xml: &str) -> (Option<String>, Option<u32>) {
    let clean = sanitize(xml);
    let Ok(doc) = parse_reply(&clean) else { return (None, None) };
    let Some(cc) = doc.descendants().find(|n| n.has_tag_name("cc_status")) else { return (None, None) };
    let mode = child_text(cc, "task_mode").and_then(|m| m.parse::<u32>().ok()).map(|m| match m {
        1 => "always".to_string(),
        2 => "auto".to_string(),
        3 => "never".to_string(),
        other => other.to_string(),
    });
    let reason = child_text(cc, "task_suspend_reason").and_then(|r| r.parse().ok());
    (mode, reason)
}

fn parse_version(xml: &str) -> Option<String> {
    let clean = sanitize(xml);
    let doc = parse_reply(&clean).ok()?;
    let v = doc.descendants().find(|n| n.has_tag_name("server_version"))?;
    Some(format!("{}.{}.{}", child_text(v, "major")?, child_text(v, "minor")?, child_text(v, "release")?))
}

pub fn status_at(addr: &str) -> Status {
    let Ok(addr) = addr.parse::<SocketAddr>() else { return Status::NotRunning };
    // Version exchange doubles as a cheap liveness probe.
    let version = match request(&addr, "<exchange_versions>\n<major>8</major>\n<minor>0</minor>\n<release>0</release>\n</exchange_versions>") {
        Ok(reply) => parse_version(&reply),
        Err(e) if matches!(e.kind(), std::io::ErrorKind::ConnectionRefused | std::io::ErrorKind::TimedOut) => return Status::NotRunning,
        Err(e) => return Status::Unavailable { reason: e.to_string() },
    };
    let projects = match request(&addr, "<get_simple_gui_info/>").map_err(|e| e.to_string()).and_then(|r| parse_simple_gui_info(&r)) {
        Ok(p) => p,
        Err(reason) => return Status::Unavailable { reason },
    };
    let (task_mode, suspend_reason) = request(&addr, "<get_cc_status/>").map(|r| parse_cc_status(&r)).unwrap_or((None, None));
    Status::Running { version, task_mode, suspend_reason, projects }
}

pub fn status() -> Status {
    status_at(DEFAULT_ADDR)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    const GUI_INFO: &str = r#"<boinc_gui_rpc_reply>
<simple_gui_info>
<project>
    <master_url>https://climateprediction.net/</master_url>
    <project_name>climateprediction.net</project_name>
    <host_total_credit>12345.670000</host_total_credit>
    <host_expavg_credit>210.5</host_expavg_credit>
</project>
<project>
    <master_url>https://example.org/other/</master_url>
    <project_name>Rosetta & Friends</project_name>
    <host_total_credit>10</host_total_credit>
    <suspended_via_gui/>
</project>
<result>
    <name>wu_1</name>
    <project_url>https://climateprediction.net/</project_url>
    <state>2</state>
    <active_task><active_task_state>1</active_task_state><scheduler_state>2</scheduler_state></active_task>
</result>
<result>
    <name>wu_2</name>
    <project_url>https://climateprediction.net/</project_url>
    <state>2</state>
</result>
<result>
    <name>wu_3</name>
    <project_url>https://climateprediction.net/</project_url>
    <state>5</state>
    <ready_to_report/>
</result>
</simple_gui_info>
</boinc_gui_rpc_reply>"#;

    #[test]
    fn parses_projects_and_tasks() {
        let p = parse_simple_gui_info(GUI_INFO).unwrap();
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].name, "climateprediction.net");
        assert!((p[0].host_total_credit - 12345.67).abs() < 1e-6);
        assert_eq!((p[0].tasks_running, p[0].tasks_queued), (1, 1));
        assert_eq!(p[1].name, "Rosetta & Friends");
        assert!(p[1].suspended);
    }

    #[test]
    fn unauthorized_is_an_error() {
        assert!(parse_simple_gui_info("<boinc_gui_rpc_reply><unauthorized/></boinc_gui_rpc_reply>").is_err());
    }

    #[test]
    fn cc_status() {
        let x = "<boinc_gui_rpc_reply><cc_status><task_mode>2</task_mode><task_suspend_reason>4</task_suspend_reason></cc_status></boinc_gui_rpc_reply>";
        assert_eq!(parse_cc_status(x), (Some("auto".into()), Some(4)));
    }

    #[test]
    fn not_running_when_port_closed() {
        // Bind then drop to get a port that is (almost certainly) closed.
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        assert_eq!(status_at(&format!("127.0.0.1:{port}")), Status::NotRunning);
    }

    #[test]
    fn end_to_end_against_mock_client() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap().to_string();
        std::thread::spawn(move || {
            for stream in listener.incoming().take(3) {
                let mut s = stream.unwrap();
                let mut req = Vec::new();
                let mut b = [0u8; 1024];
                while !req.ends_with(&[END]) {
                    let n = s.read(&mut b).unwrap();
                    if n == 0 { break; }
                    req.extend_from_slice(&b[..n]);
                }
                let req = String::from_utf8_lossy(&req);
                let body = if req.contains("exchange_versions") {
                    "<boinc_gui_rpc_reply><server_version><major>8</major><minor>0</minor><release>4</release></server_version></boinc_gui_rpc_reply>".to_string()
                } else if req.contains("get_simple_gui_info") {
                    GUI_INFO.to_string()
                } else {
                    "<boinc_gui_rpc_reply><cc_status><task_mode>2</task_mode><task_suspend_reason>0</task_suspend_reason></cc_status></boinc_gui_rpc_reply>".to_string()
                };
                s.write_all(body.as_bytes()).unwrap();
                s.write_all(&[END]).unwrap();
            }
        });
        match status_at(&addr) {
            Status::Running { version, task_mode, suspend_reason, projects } => {
                assert_eq!(version.as_deref(), Some("8.0.4"));
                assert_eq!(task_mode.as_deref(), Some("auto"));
                assert_eq!(suspend_reason, Some(0));
                assert_eq!(projects.len(), 2);
            }
            other => panic!("unexpected {other:?}"),
        }
    }
}
