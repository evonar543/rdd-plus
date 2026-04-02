import RddApp from "@/components/RddApp";
import { version } from "@/package.json";

export default function Home() {
  return <RddApp version={version} />;
}
