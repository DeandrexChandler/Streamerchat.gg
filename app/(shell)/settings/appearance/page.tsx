import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Placeholder.
 *
 * Custom fonts, the text outline toggle, badge slots and the live preview
 * land here — see the OBS overlay appearance spec.
 */
export default function AppearancePage() {
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            How chat looks in your OBS browser source.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Custom fonts, text outline and chat badges are being built. For now,
          font size and timestamps live on the OBS page.
        </CardContent>
      </Card>
    </div>
  );
}
