import { createContext, useContext, useSyncExternalStore } from "react";
import type { Services } from "./services";
export const ServicesContext = createContext<Services | null>(null);
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("Services provider is missing");
  return services;
}
export function useJournal() {
  const { journal } = useServices();
  return useSyncExternalStore(
    journal.subscribe,
    journal.getSnapshot,
    journal.getSnapshot,
  );
}
