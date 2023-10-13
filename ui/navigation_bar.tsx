import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Countdown } from './countdown'

export const NavigationBar = () => {
  return (
    <div className="
        bg-background
        border-b
        border-[rgba(255,255,255,.15)]
        sm:border-none
        sticky
        top-0
        p-4
      ">
      <Link
        className="
          inline-block
        "
        href="/"
      >
        <Logo />
      </Link>
    </div>
  )
}

const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="30"
      height="30"
      fill="none"
      viewBox="0 0 42 44"
    >
      <path
        fill="#ACACAC"
        stroke="#EEE"
        d="M38.667 24.888c-.339-.113-.895-2.783-1.13-4.103l-2.474-2.182-3.676-4.014-6.168-1.824-1.183-1.42-3.233-2.837-8.481-2.595-8.425-3.486L1 1v12.866l8.06 1.214 4.37.68 2.574 1.334.563 2.475.616 2.53 2.853 5.119-.645 2.56-1.083.59-.878.768-.863.48-1.386 1.29-.095.66.287.521.631.247 1.042-.631 1.18-.138 1.028-.74 1.55-.59.918-.783.837-1.867V32.522l-.179.124-1.22.837-1.124 1.18-1.961 1.002-.892.769-.466.892.22.755.493.398h.645l1.604-.96.754-.083.837-.238 3.949-2.658.466-.738.754-2.264v1.557l-.353.707-1.343 1.698-.707 1.698-2.615 3.113v1.84l1.201.778 1.414-2.193 1.414-.425.99-1.556 2.615-3.255.99-1.06v-3.68l1.342 3.042 2.827 7.924.849 1.203.99.495.989-.495v-1.203L35.487 35.5l-2.12-7.923-.92-4.953 1.414.92.353 1.344 1.838 1.981 2.615 1.769h1.485L41 27.577c-.636-.85-1.993-2.576-2.333-2.689z"
      >
      </path>
    </svg>
  )
}
