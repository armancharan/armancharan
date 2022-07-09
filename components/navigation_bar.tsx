import Link from "next/link"
import { useEffect, useState } from "react"
import { Countdown } from "./countdown"

export const NavigationBar = () => {
  return (
      <div
          style={{
            alignItems: 'center',
            display: 'flex',
            height: '80px',
            justifyContent: 'space-between',
            margin: 'auto',
            maxWidth: 'calc(100vw - 20px)',
            padding: '10px 0',
            width: '1000px',
          }}
      >
        <Link href="/" passHref>
          <a style={{ textDecoration: 'none' }}>
            <h1
                style={{
                  color: 'black',
                  fontSize: '15px',
                  fontWeight: 600,
                  lineHeight: 1,
                  margin: 0,
                }}
            >
              ARMAN CHARAN
            </h1>
          </a>
        </Link>

        <Countdown
            endDate={new Date(new Date().getFullYear() + 1, 3, 23)} // 23rd April, next year
        />
      </div>
  )
}
