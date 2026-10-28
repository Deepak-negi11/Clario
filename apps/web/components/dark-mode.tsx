"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ModeToggle() {
    const { setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    const handleClick = () => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    if (!mounted) return <span className="h-9 w-9" aria-hidden="true" />;

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label={resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"}
            title={resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-[#4b5a70] transition-colors hover:bg-[#c7d8ee] hover:text-[#112f78] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12388f]"
        >
            {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
            ) : (
                <Moon className="h-4 w-4" />
            )}
        </button>
    )
}
