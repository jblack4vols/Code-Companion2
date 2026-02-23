import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Monitor, GitBranch, Globe, Terminal, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";

const steps = {
  replit: [
    "Go to replit.com and log in from any browser on your Mac or PC",
    "Open your Tristar 360° project from your dashboard",
    "Edit files directly in the browser-based code editor",
    "Changes save automatically — click Publish when you're ready to push updates live",
    "You can also use Replit's AI Agent to make changes by describing what you want in plain English",
  ],
  githubSetup: [
    "In your Replit project, click the Git icon (branch symbol) in the left sidebar",
    "Click Connect to GitHub and authorize Replit to access your GitHub account",
    "Create a new repository or connect to an existing one",
    "Your code will sync to GitHub automatically when you push",
  ],
  githubEdit: [
    "Install Git from git-scm.com/downloads on your computer",
    "Open Terminal (Mac) or Command Prompt / PowerShell (PC)",
    "Clone your repo: git clone https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git",
    "Open the folder in a code editor like VS Code (free at code.visualstudio.com)",
    "Make your changes, then save and push using: git add . && git commit -m \"Your message\" && git push",
    "Back in Replit, pull the latest changes using the Git panel, then Publish to update the live app",
  ],
  vercelSetup: [
    "First, connect your code to GitHub (see Option 2 above)",
    "Go to vercel.com and sign up (free tier available)",
    "Click Add New Project and import your GitHub repository",
    "Configure build settings: Framework Preset = Other, Build Command = npm run build, Output Directory = dist",
    "Add your environment variables in Vercel Settings > Environment Variables (copy from Replit: DATABASE_URL, SESSION_SECRET, etc.)",
    "Click Deploy",
  ],
  vercelUpdating: [
    "Every time you push changes to GitHub, Vercel will automatically rebuild and deploy your app",
    "No need to manually publish — it's fully automatic",
  ],
};

function StepList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((step, i) => (
        <li key={i} className="flex gap-3 items-start" data-testid={`step-item-${i}`}>
          <span className="flex items-center justify-center h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold mt-0.5">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export default function DeveloperGuidePage() {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto" data-testid="developer-guide-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-guide-title">Developer Guide</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How to edit and manage Tristar 360° from your MacBook or PC
        </p>
      </div>

      <Card data-testid="card-replit-guide">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Option 1: Edit Directly in Replit</CardTitle>
              <Badge variant="outline" className="mt-1 text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                Easiest
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <StepList items={steps.replit} />
        </CardContent>
      </Card>

      <Card data-testid="card-github-guide">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
              <GitBranch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Option 2: Connect to GitHub</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Version control and collaboration</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              Initial Setup
            </h3>
            <StepList items={steps.githubSetup} />
          </div>
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              Editing from Your Mac or PC
            </h3>
            <StepList items={steps.githubEdit} />
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <h4 className="text-sm font-medium mb-2">Common Git Commands</h4>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <code className="bg-background px-2 py-1 rounded border whitespace-nowrap">git status</code>
                <span className="text-muted-foreground font-sans sm:ml-2">See what files have changed</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <code className="bg-background px-2 py-1 rounded border whitespace-nowrap">git pull</code>
                <span className="text-muted-foreground font-sans sm:ml-2">Download latest changes</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <code className="bg-background px-2 py-1 rounded border whitespace-nowrap">git log --oneline</code>
                <span className="text-muted-foreground font-sans sm:ml-2">View recent change history</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-vercel-guide">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Option 3: Deploy to Vercel</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Alternative hosting platform</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              Setup
            </h3>
            <StepList items={steps.vercelSetup} />
          </div>
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              Updating on Vercel
            </h3>
            <StepList items={steps.vercelUpdating} />
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <h4 className="text-sm font-medium mb-2">Required Environment Variables</h4>
            <div className="space-y-1.5 text-xs font-mono">
              <div><code className="bg-background px-2 py-0.5 rounded border">DATABASE_URL</code> <span className="text-muted-foreground font-sans ml-1">Database connection string</span></div>
              <div><code className="bg-background px-2 py-0.5 rounded border">SESSION_SECRET</code> <span className="text-muted-foreground font-sans ml-1">Session encryption key</span></div>
              <div><code className="bg-background px-2 py-0.5 rounded border">CSRF_SECRET</code> <span className="text-muted-foreground font-sans ml-1">CSRF protection key</span></div>
              <div className="text-muted-foreground font-sans pt-1">Plus any Microsoft Graph or integration API keys your app uses</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-recommendation">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recommended Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Use Replit for day-to-day editing and publishing</p>
                <p className="text-xs text-muted-foreground">Fastest option since everything is already set up</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Connect GitHub as a backup and version history</p>
                <p className="text-xs text-muted-foreground">So you never lose your work</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Only use Vercel if you need a second hosting environment</p>
                <p className="text-xs text-muted-foreground">Or want a custom domain setup outside of Replit</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center pb-4">
        <p className="text-xs text-muted-foreground">
          Your app is already published and live on Replit — you're all set to keep building from any device with a browser.
        </p>
      </div>
    </div>
  );
}
