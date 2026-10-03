import { createContext, useContext, useState } from "react";
import { Route, Switch } from "wouter";
import { useMe } from "../lib/identity";
import { Avatar } from "./Avatar";
import { Home } from "./Home";
import { ProfileDialog } from "./ProfileDialog";
import { ToastProvider } from "./Toast";
import { UploadsProvider } from "./Uploads";
import { VideoPage } from "./VideoPage";

const SwitchUserCtx = createContext<() => void>(() => {});

export function Shell({ onSwitchUser }: { onSwitchUser: () => void }) {
  return (
    <SwitchUserCtx.Provider value={onSwitchUser}>
      <ToastProvider>
        <UploadsProvider>
          <Switch>
            <Route path="/v/:id">{(p) => <VideoPage key={p.id} videoId={p.id} />}</Route>
            <Route>
              <Home />
            </Route>
          </Switch>
        </UploadsProvider>
      </ToastProvider>
    </SwitchUserCtx.Provider>
  );
}

export function ProfileButton() {
  const me = useMe();
  const onSwitchUser = useContext(SwitchUserCtx);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`${me.name}: profile and appearance`}
        className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface-2"
      >
        <Avatar name={me.name} color={me.color} size={28} />
      </button>
      {open && <ProfileDialog onClose={() => setOpen(false)} onSwitchUser={onSwitchUser} />}
    </>
  );
}
