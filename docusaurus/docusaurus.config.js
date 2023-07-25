// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github')
const darkCodeTheme = require('prism-react-renderer/themes/dracula')

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'IBC SDK Documentation',
  tagline: 'Automated tooling for cross-chain developers',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://your-docusaurus-test-site.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'open-ibc', // Usually your GitHub org/user name.
  projectName: 'ibc-sdk', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en']
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/open-ibc/ibc-sdk/blob/main/docusaurus'
        },
        // blog: {
        //   showReadingTime: true,
        //   // Please change this to your repo.
        //   // Remove this to remove the "edit this page" links.
        //   editUrl:
        //     'https://github.com/facebook/docusaurus',
        // },
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      })
    ]
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/docusaurus-social-card.jpg',
      navbar: {
        title: ' Docs',
        logo: {
          alt: 'OpenIBC logo',
          src: 'img/black-logo.jpg'
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'IBC SDK'
          },
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'IBC specs',
            href: 'https://github.com/cosmos/ibc'
          },
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'ibc-go',
            href: 'https://github.com/cosmos/ibc-go'
          },
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'ibc-rs',
            href: 'https://github.com/cosmos/ibc-rs'
          },
          {
            href: 'https://github.com/open-ibc/ibc-sdk',
            label: 'GitHub',
            position: 'right'
          }
        ]
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'IBC SDK',
                to: '/docs/'
              },
              {
                label: 'Polymer Protocol',
                to: '/docs/category/polymer-protocol'
              }
            ]
          },
          {
            title: 'Community',
            items: [
              {
                label: 'OpenIBC Forum',
                href: 'https://forum.openibc.com'
              },
              {
                label: 'Discord',
                href: 'https://discord.gg/gudz6dtF'
              },
              {
                label: 'Twitter',
                href: 'https://twitter.com/OpenIBC'
              }
            ]
          },
          {
            title: 'More',
            items: [
              {
                label: 'IBC Blog',
                to: 'https://medium.com/the-interchain-foundation/tagged/ibc'
              },
              {
                label: 'GitHub',
                href: 'https://github.com/open-ibc'
              }
            ]
          }
        ],
        copyright: `Copyright © ${new Date().getFullYear()} OpenIBC. Built with Docusaurus.`
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['bash', 'go', 'rust', 'typescript', 'solidity']
      }
    })
}

module.exports = config
