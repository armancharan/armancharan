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


type HomePageProps = {
  entries: BlogEntryPreview[]
}

const HomePage: NextPage<HomePageProps> = props => {
  
  return (
    <Page>
      <div style={{ height: '50px' }} />

      <div
            style={{
              display: 'grid',
              gridGap: 'auto',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gridTemplateRows: 'min-content',
              margin: '0 auto',
              maxWidth: '100%',
              width: '1000px',
            }}
        >
          {/* Hero. */}
          <div
              style={{

                gridColumnStart: 2,
                gridColumnEnd: 5,
                gridRowStart: 1,
                gridRowEnd: 3,
              }}
          >
            <Canvas fallback={null} >
              <Monument3D/>
              {/* <AsciiRenderer /> */}
              <OrbitControls makeDefault position={[.5, .5, 0]} target={[0, 0, 0]} minZoom={5} maxZoom={5} />
            </Canvas>
          </div>

          {/* Articles. */}
          {props.entries.map(({ id, cover, name }) => (
              <EntryPreview
                key={id}
                cover={cover}
                id={id}
                name={name}
              />
          ))}
        </div>
    </Page>
  )
}

const Monument3D = () => {
  const obj = useLoader(OBJLoader, '/arman.obj')
  
  return <PresentationControls
      global={false} // Spin globally or by dragging the model
      cursor={true} // Whether to toggle cursor style on drag
      snap={false} // Snap-back to center (can also be a spring config)
      speed={1} // Speed factor
      zoom={1} // Zoom factor when half the polar-max is reached
      rotation={[4, 1, 0]} // Default rotation
      polar={[-Infinity, Infinity]} // Vertical limits
      azimuth={[-Infinity, Infinity]} // Horizontal limits
      config={{ mass: 1, tension: 170, friction: 26 }} // Spring config
  >
    <primitive object={obj} />
  </PresentationControls>

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
          <a style={{ fontSize: '12px' }}>
            {props.name}
          </a>
        </Link>
      </div>
  )
}

export default HomePage

export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
  return {
    props: {
      entries: await getEntries()
    }
  }
}

function AsciiRenderer({ renderIndex = 1, characters = ' .:-+*=%@#', ...options }) {
  // Reactive state
  const { size, gl, scene, camera } = useThree()

  // Create effect
  const effect = useMemo(() => {
    const effect = new AsciiEffect(gl, characters, options)
    effect.domElement.style.position = 'absolute'
    effect.domElement.style.top = '0px'
    effect.domElement.style.left = '0px'
    effect.domElement.style.color = 'white'
    effect.domElement.style.backgroundColor = 'black'
    effect.domElement.style.pointerEvents = 'none'
    return effect
  }, [characters, options.invert])

  // Append on mount, remove on unmount
  useEffect(() => {
    gl.domElement.parentNode?.appendChild(effect.domElement)
    return () => {
      gl.domElement.parentNode?.removeChild(effect.domElement)
    }
  }, [effect])

  // Set size
  useEffect(() => {
    effect.setSize(size.width, size.height)
  }, [effect, size])

  // Take over render-loop (that is what the index is for)
  useFrame((state) => {
    effect.render(scene, camera)
  }, renderIndex)

  return null
}
