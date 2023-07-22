export type BlogEntry = {
  id: string
  name: string
  createdAt: Date
  coverImage: {
    url: string
    width: number
    height: number
    description: string
  }
}

const LE_PUZZ = {
  id: 'le-puzz',
  name: 'Le Puzz, The Funderful Figsaw Fumpany',
  createdAt: new Date('Sat, 08 Jul 2023 24:00:00 GMT'),
  coverImage: {
    url: '/le-puzz-cover.png',
    width: 100,
    height: 75,
    description: 'Le Puzz - Jigsaw Puzzle',
  },
}

const JUICED_UP_MI_GORENG = {
  id: 'juiced-up-mi-goreng',
  name: 'Juiced-up Mi Goreng',
  createdAt: new Date('Sat, 08 Jul 2023 24:00:00 GMT'),
  coverImage: {
    url: '/juiced-up-mi-goreng.png',
    width: 100,
    height: 75,
    description: 'Juiced-up Mi Goreng',
  },
}

const PESTO_PASTA = {
  id: 'pesto-pasta',
  name: 'A Bowl of My Delicious Pesto Pasta',
  createdAt: new Date('Sat, 08 Jul 2023 24:00:00 GMT'),
  coverImage: {
    url: '/pesto-pasta.png',
    width: 100,
    height: 75,
    description: 'Pesto Pasta',
  },
}

const IVY = {
  id: 'ivy',
  name: 'Ivy, My Most Recent Foster',
  createdAt: new Date('Sat, 08 Jul 2023 24:00:00 GMT'),
  coverImage: {
    url: '/ivy.png',
    width: 100,
    height: 75,
    description: 'Ivy',
  },
}

const WILLOW = {
  id: 'willow',
  name: 'My First Foster Cat, Willow',
  createdAt: new Date('Sat, 08 Jul 2023 24:00:00 GMT'),
  coverImage: {
    url: '/willow.png',
    width: 100,
    height: 75,
    description: 'Willow',
  },
}

const POLLY = {
  id: 'fostering-cats-part-6',
  name: 'A Cat I Sat, Polly',
  createdAt: new Date('Sat, 08 Jul 2023 24:00:00 GMT'),
  coverImage: {
    url: '/polly.png',
    width: 100,
    height: 75,
    description: 'Polly',
  },
}

const FEATHERSTON_NUMERO_IV = {
  id: 'featherston-numero-iv',
  name: `A Pair of Featherston Numeros On The Street`,
  createdAt: new Date('Sat, 08 Jul 2023 24:00:00 GMT'),
  coverImage: {
    url: '/featherston-numero-iv.png',
    width: 100,
    height: 75,
    description: `Some Featherston Numero IV's on the pavement`,
  },
}

const createFakeEntry = () => {
  const id = Math.random().toString(36).substr(2, 9)
  const name = `---------- ${id} ----------`
  const createdAt = new Date()
  const coverImage = {
    url: '/le-puzz.png',
    width: 100,
    height: 75,
    description: 'Fake Entry',
  }
  return { id, name, createdAt, coverImage }
}

export const entries: BlogEntry[] = [
  POLLY,
  WILLOW,
  LE_PUZZ,
  PESTO_PASTA,
  FEATHERSTON_NUMERO_IV,
  IVY,
  // JUICED_UP_MI_GORENG,
  // ...Array.from({ length: 50 }, createFakeEntry),
]
