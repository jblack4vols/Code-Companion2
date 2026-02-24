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

export async function sendPasswordResetEmail(
  recipientEmail: string,
  recipientName: string,
  resetUrl: string
) {
  const client = await getOutlookClient();

  const message = {
    subject: "Tristar 360° - Password Reset Request",
    body: {
      contentType: "HTML",
      content: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset</h1>
            <p style="color: #bfdbfe; margin: 5px 0 0;">Tristar 360°</p>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #1e293b; font-size: 16px;">Hi ${recipientName},</p>
            <p style="color: #475569; line-height: 1.6;">We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #64748b; font-size: 13px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        </div>
      `,
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

export async function sendTaskAssignmentEmail(
  recipientEmail: string,
  recipientName: string,
  taskTitle: string,
  taskDescription: string | null,
  dueDate: string | null,
  assignedByName: string,
  providerName: string | null,
  appUrl: string
) {
  try {
    const client = await getOutlookClient();
    const dueLine = dueDate ? `<tr><td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 120px;">Due Date:</td><td style="padding: 8px 0; color: #1e293b;">${new Date(dueDate).toLocaleDateString()}</td></tr>` : '';
    const providerLine = providerName ? `<tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Provider:</td><td style="padding: 8px 0; color: #1e293b;">${providerName}</td></tr>` : '';
    const descLine = taskDescription ? `<p style="color: #475569; line-height: 1.6; margin-top: 15px;">${taskDescription}</p>` : '';

    const message = {
      subject: `Tristar 360° - New Task Assigned: ${taskTitle}`,
      body: {
        contentType: "HTML",
        content: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #1a365d; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Tristar 360°</h1>
              <p style="color: #93c5fd; margin: 5px 0 0 0; font-size: 14px;">Task Assignment</p>
            </div>
            <div style="background-color: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1e293b; margin-top: 0;">Hi ${recipientName},</h2>
              <p style="color: #475569; line-height: 1.6;">${assignedByName} has assigned you a new task.</p>
              <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #1e293b; margin-top: 0; font-size: 16px;">${taskTitle}</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  ${providerLine}
                  ${dueLine}
                  <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Assigned By:</td><td style="padding: 8px 0; color: #1e293b;">${assignedByName}</td></tr>
                </table>
                ${descLine}
              </div>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${appUrl}/tasks" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">View Task</a>
              </div>
            </div>
          </div>`
      },
      toRecipients: [{ emailAddress: { address: recipientEmail, name: recipientName } }]
    };
    await client.api('/me/sendMail').post({ message, saveToSentItems: true });
    console.log(`[Outlook] Task assignment email sent to ${recipientEmail}`);
  } catch (err: any) {
    console.error(`[Outlook] Failed to send task assignment email: ${err.message}`);
  }
}

export async function sendOverdueTaskDigest(
  recipientEmail: string,
  recipientName: string,
  overdueTasks: Array<{ title: string; dueDate: string; providerName?: string }>,
  appUrl: string
) {
  try {
    const client = await getOutlookClient();
    const taskRows = overdueTasks.map(t => {
      const daysOverdue = Math.floor((Date.now() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24));
      return `<tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${t.title}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${t.providerName || '—'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #dc2626; font-weight: 600;">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</td>
      </tr>`;
    }).join('');

    const message = {
      subject: `Tristar 360° - ${overdueTasks.length} Overdue Task${overdueTasks.length !== 1 ? 's' : ''} Require Attention`,
      body: {
        contentType: "HTML",
        content: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #1a365d; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Tristar 360°</h1>
              <p style="color: #fbbf24; margin: 5px 0 0 0; font-size: 14px;">Overdue Tasks Digest</p>
            </div>
            <div style="background-color: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1e293b; margin-top: 0;">Hi ${recipientName},</h2>
              <p style="color: #475569; line-height: 1.6;">You have <strong>${overdueTasks.length}</strong> overdue task${overdueTasks.length !== 1 ? 's' : ''} that need${overdueTasks.length === 1 ? 's' : ''} attention.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead><tr style="background-color: #f1f5f9;">
                  <th style="padding: 10px; text-align: left; color: #64748b; font-size: 13px;">Task</th>
                  <th style="padding: 10px; text-align: left; color: #64748b; font-size: 13px;">Provider</th>
                  <th style="padding: 10px; text-align: left; color: #64748b; font-size: 13px;">Status</th>
                </tr></thead>
                <tbody>${taskRows}</tbody>
              </table>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${appUrl}/tasks" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">View All Tasks</a>
              </div>
            </div>
          </div>`
      },
      toRecipients: [{ emailAddress: { address: recipientEmail, name: recipientName } }]
    };
    await client.api('/me/sendMail').post({ message, saveToSentItems: true });
    console.log(`[Outlook] Overdue digest sent to ${recipientEmail} (${overdueTasks.length} tasks)`);
  } catch (err: any) {
    console.error(`[Outlook] Failed to send overdue digest: ${err.message}`);
  }
}

export async function sendScheduledReportEmail(
  recipientEmail: string,
  recipientName: string,
  reportName: string,
  reportType: string,
  csvContent: string,
  appUrl: string
) {
  try {
    const client = await getOutlookClient();
    const csvBase64 = Buffer.from(csvContent).toString('base64');
    const dateStr = new Date().toLocaleDateString();

    const message = {
      subject: `Tristar 360° - ${reportName} (${dateStr})`,
      body: {
        contentType: "HTML",
        content: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #1a365d; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Tristar 360°</h1>
              <p style="color: #93c5fd; margin: 5px 0 0 0; font-size: 14px;">Scheduled Report</p>
            </div>
            <div style="background-color: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1e293b; margin-top: 0;">Hi ${recipientName},</h2>
              <p style="color: #475569; line-height: 1.6;">Your scheduled <strong>${reportType}</strong> report is attached as a CSV file.</p>
              <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="color: #1e293b; font-weight: 600; margin: 0;">${reportName}</p>
                <p style="color: #64748b; font-size: 13px; margin: 5px 0 0 0;">Generated on ${dateStr}</p>
              </div>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${appUrl}/admin/scheduled-reports" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Manage Reports</a>
              </div>
            </div>
          </div>`
      },
      toRecipients: [{ emailAddress: { address: recipientEmail, name: recipientName } }],
      attachments: [
        {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: `${reportName.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr.replace(/\//g, '-')}.csv`,
          contentType: "text/csv",
          contentBytes: csvBase64
        }
      ]
    };
    await client.api('/me/sendMail').post({ message, saveToSentItems: true });
    console.log(`[Outlook] Scheduled report email sent to ${recipientEmail}: ${reportName}`);
  } catch (err: any) {
    console.error(`[Outlook] Failed to send scheduled report email: ${err.message}`);
  }
}

export async function sendProviderAlertEmail(
  recipientEmail: string,
  recipientName: string,
  alerts: Array<{ providerName: string; alertType: "declining" | "reactivated"; detail: string }>,
  appUrl: string
) {
  try {
    const client = await getOutlookClient();
    const decliningAlerts = alerts.filter(a => a.alertType === "declining");
    const reactivatedAlerts = alerts.filter(a => a.alertType === "reactivated");

    let alertRows = "";
    if (decliningAlerts.length > 0) {
      alertRows += `<tr><td colspan="3" style="padding: 12px 10px 6px; font-weight: 700; color: #dc2626; font-size: 14px; border-bottom: 2px solid #fecaca;">&#x26A0; Declining High-Value Providers</td></tr>`;
      alertRows += decliningAlerts.map(a => `<tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 500;">${a.providerName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #dc2626;">Declining</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${a.detail}</td>
      </tr>`).join('');
    }
    if (reactivatedAlerts.length > 0) {
      alertRows += `<tr><td colspan="3" style="padding: 12px 10px 6px; font-weight: 700; color: #16a34a; font-size: 14px; border-bottom: 2px solid #bbf7d0;">&#x2728; Reactivated Providers</td></tr>`;
      alertRows += reactivatedAlerts.map(a => `<tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 500;">${a.providerName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #16a34a;">New Referral</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${a.detail}</td>
      </tr>`).join('');
    }

    const message = {
      subject: `Tristar 360° - ${alerts.length} Provider Alert${alerts.length !== 1 ? 's' : ''} Require Attention`,
      body: {
        contentType: "HTML",
        content: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #1a365d; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Tristar 360°</h1>
              <p style="color: #93c5fd; margin: 5px 0 0 0; font-size: 14px;">Provider Activity Alerts</p>
            </div>
            <div style="background-color: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1e293b; margin-top: 0;">Hi ${recipientName},</h2>
              <p style="color: #475569; line-height: 1.6;">We detected <strong>${alerts.length}</strong> provider activity alert${alerts.length !== 1 ? 's' : ''} that may need your attention.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead><tr style="background-color: #f1f5f9;">
                  <th style="padding: 10px; text-align: left; color: #64748b; font-size: 13px;">Provider</th>
                  <th style="padding: 10px; text-align: left; color: #64748b; font-size: 13px;">Alert</th>
                  <th style="padding: 10px; text-align: left; color: #64748b; font-size: 13px;">Detail</th>
                </tr></thead>
                <tbody>${alertRows}</tbody>
              </table>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${appUrl}/physicians" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">View Providers</a>
              </div>
            </div>
          </div>`
      },
      toRecipients: [{ emailAddress: { address: recipientEmail, name: recipientName } }]
    };
    await client.api('/me/sendMail').post({ message, saveToSentItems: true });
    console.log(`[Outlook] Provider alert email sent to ${recipientEmail} (${alerts.length} alerts)`);
  } catch (err: any) {
    console.error(`[Outlook] Failed to send provider alert email: ${err.message}`);
  }
}
