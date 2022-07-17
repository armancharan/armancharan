import { GetStaticProps, NextPage } from 'next'
import { Page } from '../components/page'
import Link from 'next/link'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { ComponentType, useEffect, useMemo } from 'react'
import { BlogEntryPreview, getEntries } from '../utils/notion'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { OrbitControls, PerspectiveCamera, PresentationControls, useGLTF } from '@react-three/drei'
import styled from 'styled-components'
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

      <Grid>
          <Hero>
            <Canvas
                camera={{ position: new Vector3(1.618, 0, 1) }}
                fallback={null}
                style={{
                  height: '400px',
                  width: '100%',
                  // HACK: Prevents the canvas from becoming wider than the screen.
                  // Unsure why this happens.
                  maxWidth: 'calc(100vw - 20px)',
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
                    fontSize: '50px',
                    fontWeight: 800,
                    pointerEvents: 'none',
                    textAlign: 'center',
                    userSelect: 'none',
                  }}
              >
                arman charan
              </h1>
            </div>
          </Hero>

          {/* Articles. */}
          {props.entries.filter(entry => entry.publish).map(({ id, cover, name }) => (
              <EntryPreview
                key={id}
                cover={cover}
                id={id}
                name={name}
              />
          ))}
        </Grid>
    </Page>
  )
}

const Grid = styled.div`
  display: grid;
  margin: 0 auto;
  max-width: 100%;
  position: relative;

  
  grid-row-gap: 20px;
  grid-column-gap: 20px;
  grid-template-columns: repeat(3, 1fr);

  @media(min-width: 1000px) {
    grid-template-columns: repeat(4, 1fr);
  }
`

const Hero = styled.div`
  max-width: 100%;
  position: relative;
  width: 100%;

  grid-column-start: 1;
  grid-column-end: 5;
  grid-row-start: 1;
  grid-row-end: 3;
  
  @media (min-width: 1000px) {
    grid-column-start: 2;
    grid-column-end: 5;
    grid-row-start: 1;
    grid-row-end: 3;
  }
`

const Monument3D = () => {
  const obj = useLoader(OBJLoader, '/arman.obj')

  return <primitive object={obj} />

}

const EntryPreview: ComponentType<{ cover: string | null, id: string, name: string }> = props => {
  return (
      <div style={{ height: '200px', margin: '0', width: '100%' }}>
        <div>
          {props.cover && <img
              src={props.cover}
              style={{
                border: '1px solid #E8E3E3',
                background: '#FAFAFA',
                borderRadius: '0',
                height: '150px',
                objectFit: 'contain',
                width: '100%',
              }}
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

export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
  return {
    props: {
      entries: await getEntries()
    }
  }
}
