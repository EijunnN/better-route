import { ProtectedPage } from "@/components/auth/protected-page";
import { ChatProvider } from "@/components/chat";
import {
  MonitoringDashboardView,
  MonitoringProvider,
} from "@/components/monitoring";

export default function MonitoringPage() {
  return (
    <ProtectedPage requiredPermission="vehicle:read">
      <MonitoringProvider>
        <ChatProvider>
          {/* `data-cockpit` scopes the operations-control aesthetic
              (IBM Plex pairing, acid-green LEDs, glass surfaces) — see
              globals.css. The font variables themselves are declared on
              <body> in the root layout so they cascade through Radix
              portals (Dialog, Popover) that render outside this tree. */}
          <div data-cockpit>
            <MonitoringDashboardView />
          </div>
        </ChatProvider>
      </MonitoringProvider>
    </ProtectedPage>
  );
}
