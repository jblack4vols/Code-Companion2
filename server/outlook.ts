// Outlook integration via Microsoft Graph API (Replit connector)
import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Outlook not connected');
  }
  return accessToken;
}

async function getOutlookClient() {
  const accessToken = await getAccessToken();
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

export async function sendWelcomeEmail(
  recipientEmail: string,
  recipientName: string,
  password: string,
  loginUrl: string
) {
  const client = await getOutlookClient();

  const message = {
    subject: "Welcome to Tristar 360° - Your Account Has Been Created",
    body: {
      contentType: "HTML",
      content: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #1a365d; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Tristar 360°</h1>
            <p style="color: #93c5fd; margin: 5px 0 0 0; font-size: 14px;">Physician Relationship Management</p>
          </div>
          <div style="background-color: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1e293b; margin-top: 0;">Welcome, ${recipientName}!</h2>
            <p style="color: #475569; line-height: 1.6;">
              Your Tristar 360° account has been created. You can now log in to access the physician relationship management platform.
            </p>
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #1e293b; margin-top: 0; font-size: 16px;">Your Login Credentials</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 100px;">Email:</td>
                  <td style="padding: 8px 0; color: #1e293b;">${recipientEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Password:</td>
                  <td style="padding: 8px 0; color: #1e293b;">${password}</td>
                </tr>
              </table>
            </div>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${loginUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Log In to Tristar 360°</a>
            </div>
            <p style="color: #94a3b8; font-size: 13px; margin-bottom: 0; text-align: center;">
              For security, we recommend changing your password after your first login.
            </p>
          </div>
          <div style="text-align: center; padding: 15px; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">Tristar Physical Therapy</p>
          </div>
        </div>
      `
    },
    toRecipients: [
      {
        emailAddress: {
          address: recipientEmail,
          name: recipientName
        }
      }
    ]
  };

  await client.api('/me/sendMail').post({ message, saveToSentItems: true });
}
