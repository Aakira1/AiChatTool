// Single source of truth for connectors. Each connector maps to one OAuth
// provider; a provider may back several connectors (Microsoft Graph powers
// OneDrive, SharePoint and Teams), so connecting one connects its siblings.

export const PROVIDER_AUTH = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/drive.readonly openid email",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  microsoft: {
    // tenant is substituted at runtime from env.oauthProviders.microsoft.tenant
    authorizeUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    scope:
      "offline_access User.Read Files.Read.All Sites.Read.All Channel.ReadBasic.All ChannelMessage.Read.All Chat.Read",
    extraAuthParams: { response_mode: "query" },
  },
  atlassian: {
    authorizeUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scope:
      "read:jira-work read:jira-user read:confluence-content.all read:confluence-space.summary offline_access",
    extraAuthParams: { audience: "api.atlassian.com", prompt: "consent" },
  },
};

export const CONNECTORS = [
  { id: "google-drive", label: "Google Drive", provider: "google", icon: "drive", description: "Search Docs, Sheets and files in Drive." },
  { id: "onedrive", label: "OneDrive", provider: "microsoft", icon: "onedrive", description: "Search your personal OneDrive files." },
  { id: "sharepoint", label: "SharePoint", provider: "microsoft", icon: "sharepoint", description: "Search SharePoint sites and documents." },
  { id: "teams", label: "Microsoft Teams", provider: "microsoft", icon: "teams", description: "Search Teams channel messages." },
  { id: "jira", label: "Jira", provider: "atlassian", icon: "jira", description: "Search Jira issues and tickets." },
  { id: "confluence", label: "Confluence", provider: "atlassian", icon: "confluence", description: "Search Confluence pages and spaces." },
];

export function getConnector(id) {
  return CONNECTORS.find((c) => c.id === id) ?? null;
}

export function connectorsForProvider(provider) {
  return CONNECTORS.filter((c) => c.provider === provider);
}
