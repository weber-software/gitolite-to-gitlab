var exec = require('child_process');

function syncRepo(src, dest) {
    exec.execSync('rm -rf temp');
    exec.execSync('git clone --mirror ' + src + ' temp', {stdio:[0,1,2]});
    exec.execSync('git -C temp remote add new-origin ' + dest, {stdio:[0,1,2]});
    exec.execSync('git -C temp push new-origin --mirror', {stdio:[0,1,2]});
}

//parse git ssh output
function extractRepos(data) {
    var list = data.split('\n');

    var result = [];

    for (var i = 0; i < list.length; i++) {
        var parts = list[i].split('\t');
        if (parts.length >= 2) {
            result.push(parts[1]);
        }
    }
    return result;
}

function getPath(repo, filter) {
    var original = repo;

    if (filter) {
        if (repo.indexOf(filter) !== 0) {
            return;
        }
        repo = repo.substring(filter.length);
    }

    //"+ seems to be not supported by gitlab so change it to "-"
    var parts = repo.replace('+', '-').split('/');
    if (parts.length < 1) {
        return;
    }
    if  (parts.length === 1) {
        return { name: parts[0], original: original  };
    }
    var group = "";
    for (var i = 0; i < parts.length - 1; i++) {
        if (group !== "") {
            group += ".";
        }
        group += parts[i];
    }
    return { name: parts[parts.length - 1], group: group, original: original };
}

function lookup(repos, filter) {
    var result = [];
    for (var i = 0; i < repos.length; i++) {
        var repo = getPath(repos[i], filter);
        if (repo) {
            result.push(repo);
        }
    }
    return result;
}

function extractGroups(repos) {
    var result = [];
    for (var i = 0; i < repos.length; i++) {
        if (repos[i].group && result.indexOf(repos[i].group) === -1) {
            result.push(repos[i].group);
        }
    }
    return result;
}

//gitlab
function request(url, token, path, data) {
    var cmd = 'curl -s';
    cmd += ' --insecure';
    cmd += ' -H "PRIVATE-TOKEN: ' + token + '"';
    cmd += ' -H "Content-Type:application/json"';
    if (data !== undefined) {
        cmd += ' -d \'' + JSON.stringify(data) + '\'';
    }
    cmd += ' "' + url + '/api/v3/' + path + '?per_page=100&page=1"';
    var result = exec.execSync(cmd);
    console.log(cmd);
    console.log(result.toString());
    return JSON.parse(result);
}

function createRepo(url, token, repoName, namespaceId) {
    return request(url, token, 'projects', { name: repoName, namespace_id: namespaceId });
}

function createGroup(url, token, groupName) {
    return request(url, token, 'groups', { name: groupName, path: groupName });
}

function getNamespaces(url, token) {
    return request(url, token, 'namespaces');
}

function getProjects(url, token) {
    return request(url, token, 'projects');
}

function getUser(url, token) {
    return request(url, token, 'user');
}

function findGroupId(namespaces, name) {
    for (var i = 0; i < namespaces.length; i++) {
        if (namespaces[i].path === name && namespaces[i].kind === 'group') {
            return namespaces[i].id;
        }
    }
}

function findUserNamespaceId(namespaces, name) {
    for (var i = 0; i < namespaces.length; i++) {
        if (namespaces[i].path === name && namespaces[i].kind === 'user') {
            return namespaces[i].id;
        }
    }
}

function findProject(projects, name, group) {
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].name === name && projects[i].namespace.name === group) {
            return projects[i];
        }
    }
}

//misc...
function createMissingGroups(url, token, groups, namespaces) {
    var result = false;
    for (var i = 0; i < groups.length; i++) {
        if (findGroupId(namespaces, groups[i]) === undefined) {
            console.log("creating group " + groups[i]);
            createGroup(url, token, groups[i]);
            result = true;
        }
    }
    return result;
}

function createMissingProjects(url, token, repos, projects, namespaces, userNamespace, username) {
    var result = false;
    for (var i = 0; i < repos.length; i++) {
        var groupName = repos[i].group === undefined ? username : repos[i].group;
        if (findProject(projects, repos[i].name, groupName) === undefined) {
            console.log("creating repo " + groupName + "/" + repos[i].name);

            var namespaceId = (repos[i].group === undefined ? userNamespace : findGroupId(namespaces, repos[i].group));
            createRepo(url, token, repos[i].name, namespaceId);
            result = true;
        }
    }
    return result;
}

function transferRepos(originalPath, repos, projects, username) {
    for (var i = 0; i < repos.length; i++) {
        var groupName = repos[i].group === undefined ? username : repos[i].group;
        var project = findProject(projects, repos[i].name, groupName);

        var src = originalPath + ':' + repos[i].original;
        var dest = project.ssh_url_to_repo;
        console.log([src, dest]);

        syncRepo(src, dest);
    }
}

var source = process.env.GITOLITE;
var token = process.env.GITLAB_TOKEN;
var url = process.env.GITLAB_URL;
var filter = process.env.PROJECT_FILTER;

if (!source || !token || !url) {
    console.log("required environment variables: GITOLITE GITLAB_TOKEN GITLAB_URL");
    return;
}

console.log('will copy repositories' + (filter ? ' starting with ' + filter : '') + ' from ' + source + ' to ' + url);

//we log in to get a list of all repositories
var result = exec.execSync('ssh ' + source).toString('utf8');
var sourceRepos = extractRepos(result);
var newRepos = lookup(sourceRepos, filter);
var groups = extractGroups(newRepos);

//get our username on the gitlab server
var user = getUser(url, token);
console.log("user: " + user.username);

//read the namespaces (groups) that exists on the gitlab server
var namespaces = getNamespaces(url, token);

var userNamespace = findUserNamespaceId(namespaces, user.username);

//create the missing ones
var created = createMissingGroups(url, token, groups, namespaces);
if (created) {
    namespaces = getNamespaces(url, token);
}

//read the existing projects
var existingProjects = getProjects(url, token);

created = createMissingProjects(url, token, newRepos, existingProjects, namespaces, userNamespace, user.username);
if (created) {
    existingProjects = getProjects(url, token);
}

//transfer the repositories
transferRepos(source, newRepos, existingProjects, user.username);