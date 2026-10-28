"use client";

import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LogOut, User, Settings } from "lucide-react";
import { getAuthToken, removeAuthToken, getAuthEmail, removeAuthEmail } from "../lib/auth-token";
import { EditProfileModal } from "./edit-profile-modal";
import { getUserProfile } from "../lib/auth-api";


function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as { userId: string };
  } catch {
    return null;
  }
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = getAuthToken();
    setIsLoggedIn(!!token);
    setEmail(getAuthEmail());

    const savedUsername = localStorage.getItem("metaverse:username");
    setUsername(savedUsername);

    if (token && !savedUsername) {
      const parsed = parseJwt(token);
      if (parsed?.userId) {
        getUserProfile(token, parsed.userId)
          .then((res) => {
            const userMeta = res.avatars[0];
            if (userMeta?.username) {
              localStorage.setItem("metaverse:username", userMeta.username);
              setUsername(userMeta.username);
            }
          })
          .catch((err) => console.error("Failed to load user profile:", err));
      }
    }
  }, [isLoggedIn]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    removeAuthToken();
    removeAuthEmail();
    localStorage.removeItem("metaverse:username");
    setIsLoggedIn(false);
    setEmail(null);
    setUsername(null);
    setIsDropdownOpen(false);
    router.replace("/");
  };

  const isSignIn = pathname === "/signin";
  const isSignUp = pathname === "/signup";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/5  bg-transparent backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="group flex shrink-0 items-center gap-1.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1b5c40]">
            <BrandLogo
              markSize={28}
              className="text-[21px] text-[#171a18] transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none"
            />
          </Link>

          <nav className="flex items-center gap-1.5 text-sm" aria-label="Primary navigation">

            {isSignIn && (
              <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-sm border-2 border-[#111827]  bg-[#171a18]  px-3 py-1.5 font-bold text-white   transition ">
                Get started
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            )}
            {isSignUp && (
              <Link href="/signin" className="rounded-md px-3 py-2 font-medium text-gray-700  transition-colors hover:bg-black/5  hover:text-black ">
                Sign in
              </Link>
            )}


            {!isSignIn && !isSignUp && (
              <>
                {isLoggedIn ? (
                  <div className="flex items-center gap-4">

                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700  hover:bg-black/5  hover:text-black  transition-colors focus:outline-none"
                        aria-label="Account Settings"
                      >
                        <User size={22} className="stroke-[1.75]" />
                      </button>


                      {isDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-[#2d2d2d]  border border-neutral-700/60  rounded-2xl p-4 shadow-xl z-50 text-white animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="px-1 pb-3 mb-2 border-b border-neutral-700/50">
                            <p className="text-sm font-bold truncate text-[#e1e1e6]">
                              {username || "User Account"}
                            </p>
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {email}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                setIsDropdownOpen(false);
                                setIsEditProfileOpen(true);
                              }}
                              className="w-full flex items-center gap-2.5 px-1 py-1.5 text-sm text-[#e1e1e6] hover:text-white rounded-lg transition-colors font-medium text-left"
                            >
                              <Settings size={18} className="stroke-[1.75]" />
                              <span>Edit Profile</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleSignOut}
                              className="w-full flex items-center gap-2.5 px-1 py-1.5 text-sm text-[#e1e1e6] hover:text-white rounded-lg transition-colors font-medium text-left border-t border-neutral-700/30 pt-2.5 mt-1.5"
                            >
                              <LogOut size={18} className="stroke-[1.75]" />
                              <span>Sign Out</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <a href="#how-it-works" className="hidden rounded-md px-3 py-2 font-medium text-gray-600  transition-colors hover:bg-black/5  hover:text-black  sm:inline-flex">
                      How it works
                    </a>
                    <Link href="/signin" className="rounded-md px-3 py-2 font-medium text-gray-600  transition-colors hover:bg-black/5  hover:text-black ">
                      Sign in
                    </Link>
                    <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-sm border-2 border-[#111827]  bg-[#171a18]  px-3 py-1.5 font-bold text-white   transition ">
                      Get started
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  </>
                )}
              </>
            )}
          </nav>
        </div>
      </header>

      <EditProfileModal
        open={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        onUpdated={(newUsername, newEmail) => {
          setUsername(newUsername);
          setEmail(newEmail);
        }}
      />
    </>
  );
}
