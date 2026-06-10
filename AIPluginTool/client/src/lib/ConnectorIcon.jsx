import googleDriveUrl from "../assets/google_drive_icon.svg?url";
import onedriveUrl from "../assets/ms_onedrive_icon.svg?url";
import sharepointUrl from "../assets/ms_sharepoint_icon.svg?url";
import teamsUrl from "../assets/teams_icon.svg?url";
import jiraUrl from "../assets/jira_icon.svg?url";
import confluenceUrl from "../assets/confluence_logo.svg?url";

const ICON_MAP = {
  drive: googleDriveUrl,
  onedrive: onedriveUrl,
  sharepoint: sharepointUrl,
  teams: teamsUrl,
  jira: jiraUrl,
  confluence: confluenceUrl,
};

export function ConnectorIcon({ id, size = 20 }) {
  const src = ICON_MAP[id];
  if (!src) return "🔌";
  return <img src={src} alt="" width={size} height={size} style={{ objectFit: "contain", display: "block" }} />;
}
