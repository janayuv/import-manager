import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTheme } from '@/components/layout/theme-context';

export function AccentButtonDemo() {
  const { theme } = useTheme();

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Accent Color Button Demo</CardTitle>
          <CardDescription>
            Current theme: {theme.color} - Buttons automatically adapt to the
            selected accent color
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Regular buttons */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Regular Buttons</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="default">Default</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>

          {/* Accent color buttons */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Accent Color Buttons</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="default" useAccentColor>
                Accent Default
              </Button>
              <Button variant="outline" useAccentColor>
                Accent Outline
              </Button>
              <Button variant="ghost" useAccentColor>
                Accent Ghost
              </Button>
              <Button variant="link" useAccentColor>
                Accent Link
              </Button>
            </div>
          </div>

          {/* Direct accent variants */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Direct Accent Variants</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="accent">Accent</Button>
              <Button variant="outline-accent">Outline Accent</Button>
              <Button variant="ghost-accent">Ghost Accent</Button>
              <Button variant="link-accent">Link Accent</Button>
            </div>
          </div>

          {/* Semantic buttons */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Semantic Buttons</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="success">Success</Button>
              <Button variant="warning">Warning</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="info">Info</Button>
              <Button variant="neutral">Neutral</Button>
            </div>
          </div>

          {/* Different sizes */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Button Sizes</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="accent" size="sm">
                Small
              </Button>
              <Button variant="accent" size="default">
                Default
              </Button>
              <Button variant="accent" size="lg">
                Large
              </Button>
              <Button variant="accent" size="icon">
                🎨
              </Button>
            </div>
          </div>

          {/* Theme information */}
          <div className="bg-muted mt-8 rounded-lg p-4">
            <h4 className="mb-2 font-semibold">Theme Information</h4>
            <p className="text-muted-foreground text-sm">
              Current theme color:{' '}
              <span className="font-mono font-semibold">{theme.color}</span>
            </p>
            <p className="text-muted-foreground text-sm">
              Mode:{' '}
              <span className="font-mono font-semibold">{theme.mode}</span>
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              Accent color buttons automatically use the CSS variables defined
              for the current theme color. Change the theme in the header to see
              the buttons update dynamically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
