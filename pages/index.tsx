import { GetStaticProps, NextPage } from 'next'
import { Page } from '../components/page'
import Link from 'next/link'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { ComponentType, useEffect, useMemo } from 'react'
import { BlogEntryPreview, getEntries } from '../utils/notion'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { OrbitControls, PerspectiveCamera, PresentationControls, useGLTF } from '@react-three/drei'
import { AsciiEffect } from 'three-stdlib'
import { Vector3 } from 'three'

const Colors = {
  BLACK: '#000000',
}


type HomePageProps = {
  entries: BlogEntryPreview[]
}

const HomePage: NextPage<HomePageProps> = props => {

  return (
    <Page>
      <div style={{ height: '50px' }} />

      <div
            style={{
              // display: 'grid',
              // gridGap: 'auto',
              // gridTemplateColumns: 'repeat(4, 1fr)',
              // gridTemplateRows: 'min-content',
              margin: '0 auto',
              maxWidth: '100%',
              width: '1000px',

              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
        >
          {/* Hero. */}
          <div
              style={{
                position: 'relative',

                gridColumnStart: 2,
                gridColumnEnd: 5,
                gridRowStart: 1,
                gridRowEnd: 3,
              }}
          >
            <Canvas
                camera={{ position: new Vector3(1.618, 0, 1) }}
                fallback={null}
                style={{
                  width: '1000px',
                  maxWidth: '100%',
                }}
            >
              <Monument3D/>
              {/* <AsciiRenderer /> */}
              <OrbitControls
                  autoRotate={true}
                  enablePan={false}
                  enableRotate={false}
                  enableZoom={false}
              />
            </Canvas>

            <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
            >
              <h1
                  style={{
                    fontWeight: 800,
                    fontSize: '50px',
                    textAlign: 'center',
                  }}
              >
                arman charan
              </h1>
            </div>
          </div>

          {/* Articles. */}
          {/* {props.entries.map(({ id, cover, name }) => (
              <EntryPreview
                key={id}
                cover={cover}
                id={id}
                name={name}
              />
          ))} */}
        </div>
    </Page>
  )
}

const Monument3D = () => {
  const obj = useLoader(OBJLoader, '/arman.obj')

  return <primitive object={obj} />

}

const EntryPreview: ComponentType<{ cover: string | undefined, id: string, name: string }> = props => {
  return (
      <div style={{ height: '200px', margin: '0', width: '100%' }}>
        <div>
          {props.cover && <img
              src={props.cover}
              style={{ border: '1px solid black', borderRadius: '0', width: '100%' }}
          />}
        </div>

        <Link href={`/entry/${props.id}`} passHref>
          <a style={{ color: Colors.BLACK, fontSize: '12px' }}>
            {props.name}
          </a>
        </Link>
      </div>
  )
}

export default HomePage

// export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
//   return {
//     props: {
//       entries: await getEntries()
//     }
//   }
// }
