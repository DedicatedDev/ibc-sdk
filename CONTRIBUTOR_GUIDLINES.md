# IBC SDK: Contributor Guidelines

First of all, thanks for your interest in contributing to IBC SDK! We appreciate all the effort and dedication from the community to make IBC SDK a powerful tool for cross-chain application development.

## Areas of Contribution

There are two main areas we are currently seeking contributions in:

1. **Library Development:** We are looking to extend the functionality of the IBC SDK by transforming it into a library. This will allow higher-level application framework developers to build on top of the existing code, providing better-suited competencies and knowledge to make the SDK most useful to cross-chain application developers.

2. **User Interface Development:** We are aiming to develop a dashboard or user interface to streamline interactions with the IBC SDK. The dashboard should provide functionalities like deploying and interacting with smart contracts, serving as a transaction explorer, and, more importantly, monitoring IBC packets. An example to take inspiration from could be "https://celat.one".

Also check out the _roadmap_ section in the [Readme](README.md) for smaller pieces of work that are available for you to pick up.

### User Feedback and Feature requests

Next to these larger areas of improvement, we also welcome any form of user feedback, improvment proposals or feature requests.

Feel free to open up an issue directly or first open up a conversation in the Polymer [Discord server](https://discord.gg/PM54RNM8), which will feature a dedicated channel for feedback and requests.

## Code of Conduct

Before starting with your contribution, please make sure you have read and understood our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating in this project, you agree to abide by its terms.

## How to Contribute

### Communication and Coordination

Before you start to work on something, it is important to ensure that your effort is coordinated with other contributors. This will help avoid duplicate work, and it will allow others to provide input on your planned contributions.

Here's a set of steps to help streamline your contributions:

1. **Check Existing Issues or Pull Requests:** Always start by checking the [issue tracker](https://github.com/open-ibc/ibc-sdk/issues) and [pull requests](https://github.com/open-ibc/ibc-sdk/pulls) to see if someone else is already working on the same thing.

2. **Reach Out to the Assigned Engineer:** If there is an existing issue or pull request, try reaching out to the contributor assigned to it. You can use GitHub's mention system for this by typing `@` followed by their username in a comment. Politely ask if they need help with it or if it's okay for you to contribute to the issue or pull request.

3. **Create a New Issue and Assign Yourself:** If there's no existing issue or pull request for what you want to work on, go ahead and create a new issue. Describe what you plan to do, and assign the issue to yourself. This will let others know you've started working on it, and they can give feedback or coordinate their work accordingly.

4. **Unassign Yourself When Needed:** If for any reason you decide to stop working on the issue or pull request you assigned to yourself, please unassign yourself. This will let others know they can pick it up or continue where you left off.

Remember, open source is a collaborative effort. Communication and coordination are key to a productive community and successful project!

### Workflow

1. Fork the Repository

Go to the [IBC SDK GitHub repository](https://github.com/open-ibc/ibc-sdk) and click on the "Fork" button. This will create a copy of the repository in your own GitHub account.

2. Clone the Forked Repository

Clone your forked repository to your local machine by using the following command:

```bash
git clone https://github.com/<your-github-username>/ibc-sdk.git
cd ibc-sdk
```

3. Create a New Branch

Create a new branch where you will make your changes. Please use a descriptive name for your branch:

```bash
git checkout -b <branch-name>
```

4. Make Your Changes

Make the changes you want to contribute. These can be bug fixes, new features, or improvements in documentation.

5. Test Your Changes

Ensure your changes do not introduce any new bugs and, if possible, add tests for your new features.

Run the e2e test, via:

```bash
make test-e2e
```

6. Commit Your Changes

Add your changes to the Git staging area and commit them:

```bash
git add .
git commit -m "<commit-message>"
```

Please write a clear and meaningful commit message describing your changes.

7. Push to GitHub

Push your changes to your forked repository on GitHub:

```bash
git push origin <branch-name>
```

8. Create a Pull Request

Go to your forked repository on GitHub and click on the "New pull request" button. Make sure the base repository is `open-ibc/ibc-sdk` and the base branch is `main`. Also ensure the head repository is your forked repository and the compare branch is the branch with your changes.

## Best Practices

To ensure efficient collaboration, try to observe the following best practices:

- **Provide a title and detailed description of the changes in your issue or pull request.** It can potentialy save reviewers a lot of time and makes it more likely to have a quick review of your contribution.
- When reporting issues or bugs, please **add details around machine info, version and steps to reproduce**.
- Try to **break up PR's** in relatively small pieces to review. It may makes sense to bundle some changes, but try to make the changes as modular as possible to expedite the review process.

## Code Review Process

After you submit your pull request, it will be reviewed by the Polymer Labs team and potentially other contributors. You may be asked to make some changes to your pull request. Once your pull request is accepted, your changes will be merged into the main branch.

## Questions or Problems?

If you have any questions or problems, feel free to reach out to the community on the Polymer [Discord server](https://discord.gg/PM54RNM8), which will feature a dedicated channel for feedback and requests.

Thank you for helping us make IBC SDK even better! 🚀
