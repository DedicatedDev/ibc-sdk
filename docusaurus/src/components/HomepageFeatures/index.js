import React from 'react'
import clsx from 'clsx'
import styles from './styles.module.css'

const FeatureList = [
  {
    title: 'Quick & Easy to Use',
    Svg: require('@site/static/img/quick.svg').default,
    description: (
      <>
        No longer wait for hours or days to get your setup right to test your cross-chain applications. Get started in a
        matter of minutes and integrate with your dev environment of choice.
      </>
    )
  },
  {
    title: 'Focus on What Matters',
    Svg: require('@site/static/img/build.svg').default,
    description: (
      <>
        IBC SDK lets you focus on your application, and we&apos;ll do the chores. Have your contract artifacts ready and
        have the IBC SDK run the Docker orchestration and IBC prep.
      </>
    )
  },
  {
    title: 'Powered by IBC & Polymer',
    Svg: require('@site/static/img/powered.svg').default,
    description: <>Believe in a future with a standardised interop solution? IBC and Polymer make it a reality.</>
  }
]

function Feature({ Svg, title, description }) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  )
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  )
}
