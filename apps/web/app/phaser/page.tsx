"use client";

  import dynamic from "next/dynamic";
  import { useEffect } from "react";
  import { useRouter } from "next/navigation";
  import { getAuthToken } from "../../lib/auth-token";


  const PhaserGame = dynamic(
    () => import("../../components/phaser/phaser-game").then((m) => m.PhaserGame),
    { ssr: false },
  );

  export default function PhaserTestPage() {
    const router = useRouter();

    useEffect(() => {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
      }
    }, [router]);

    return (

      <div className="h-screen w-screen overflow-hidden bg-neutral-950">
        <PhaserGame />
      </div>
    );
  }
