# gitolite-to-gitlab

a node.js script to automatically exports git projects from a gitolite server to an gitlab server.

1.  it creates groups on the gitlab server
2.  inside these groups the new repositories are created
3.  git repositories are cloned and mirrored to the new repositories

## Groups

Subpaths (git@my-private-gitolite.de:/blaa/blubb/project) from the gitolite server are not directly supported by gitlab.
Gitlab also doesn't support sub groups.
Because of that groups are created that are named by the complete path and seperated by a dot ("/blaa/blubb/project" -> group: "blaa.blubb")

## Prerequisites

-   make a backup of your gitolite server
-   make a backup of your gitlab server
-   your default ssh key has to be associated with an account on the gitolite server
-   your default ssh key has to be associated with your account on the gitlab server (Profile Settings -> SSH Keys)
-   you need your private token from the gitlab server (Profile Settings -> Account -> Private token)

## Usage

    GITOLITE="git@my-private-gitolite.de"
    GITLAB_URL="https://my-private-gitlab.de/"
    GITLAB_TOKEN="d9LARy4eRSbKc2DRM17Q"
    node gitolite-to-gitlab.js
