import { GetServerSideProps, NextPage } from 'next'
import { Page } from '../components/page'
import Link from 'next/link'
import { Canvas, useLoader } from '@react-three/fiber'
import { ComponentType } from 'react'
import { BlogEntryPreview, getEntries } from '../utils/notion'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { OrbitControls } from '@react-three/drei'
import { Vector3 } from 'three'
import Image from 'next/image'
import styles from './index.module.scss'

const Colors = {
  BLACK: '#000000',
}

type HomePageProps = {
  entries: BlogEntryPreview[],
}

const HomePage: NextPage<HomePageProps> = props => {

  return (
    <Page>
      <div style={{ height: '50px' }} />

      <div className={styles.grid}>
          <div className={styles.hero}>
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

              <OrbitControls
                  autoRotate={true}
                  enablePan={false}
                  enableRotate={false}
                  enableZoom={false}
              />
            </Canvas>

            {/* TODO: Decide whether or not to publish some sort of background image. */}
            {/* <img
                src="/clouds.png"
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  height: '100%',
                  justifyContent: 'center',
                  left: 0,
                  objectFit: 'cover',
                  position: 'absolute',
                  top: 0,
                  width: '100%',
                  zIndex: -1,
                }}
            /> */}
          </div>

          {/* Articles. */}
          {props.entries.filter(entry => entry.publish).map(props => (
              <EntryPreview
                key={props.id}
                {...props}
              />
          ))}
        </div>
    </Page>
  )
}

const Monument3D = () => {
  const obj = useLoader(OBJLoader, '/arman.obj')

  return <primitive object={obj} />

}

const EntryPreview: ComponentType<BlogEntryPreview> = props => {
  return (
      <div style={{ height: '200px', margin: '0', width: '100%', position: 'relative' }}>
        
          {props.cover && <div
              style={{
                border: '1px solid #E8E3E3',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#FAFAFA',
                borderRadius: '0',
              }}
            >
              <Image
                  src={props.cover}
                  height="100%"
                  width="100%"
                  objectFit="contain"
                  objectPosition="center"      
              />
          </div>}
        <Link href={`/entry/${props.id}`} passHref>
          <a style={{ color: Colors.BLACK, fontSize: '13px' }}>
            {props.name}
          </a>
        </Link>

        {props.tags ? (
            <div style={{ marginTop: '2px' }}>
              {props.tags.map(tag => {
                return (
                  <div
                      className={styles.tag}
                      key={tag.id}
                  >
                    {tag.name}
                  </div>
                )
              })}
            </div>
        ) : null}
      </div>
  )
}

export default HomePage

export const getServerSideProps: GetServerSideProps<HomePageProps> = async () => {
  return {
    props: {
      entries: await getEntries()
    }
  }
}
