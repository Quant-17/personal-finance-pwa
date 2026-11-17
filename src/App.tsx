import { lazy, Suspense } from "react";
const DemoApp = lazy(() => import("./DemoApp"));
const PrivateApp = lazy(() => import("./private/PrivateApp"));
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="startup-screen" role="status">
          Opening Folio…
        </div>
      }
    >
      {import.meta.env.VITE_APP_MODE === "private" ? (
        <PrivateApp />
      ) : (
        <DemoApp />
      )}
    </Suspense>
  );
}
