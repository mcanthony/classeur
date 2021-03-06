angular.module('classeur.optional.settingPage', [])
	.config(
		function($routeProvider) {
			$routeProvider.when('/settings', {
				template: '<cl-setting-page></cl-setting-page>',
				reloadOnSearch: false
			});
		})
	.directive('clSettingPage',
		function($rootScope, $timeout, $location, clDialog, clUserSvc, clToast, clStateMgr, clSocketSvc, clSyncSvc, clFileSvc, clSettingSvc, clFilePropertiesDialog, clTemplateManagerDialog, clBlogSvc) {

			clSocketSvc.addMsgHandler('linkedUser', function(msg) {
				clToast(msg.error ? 'An error occurred.' : 'Account successfully linked.');
			});

			clSocketSvc.addMsgHandler('linkBlogToken', function(msg) {
				clBlogSvc.startOAuth(msg.blog, msg.token);
			});

			clSocketSvc.addMsgHandler('deletedUser', function() {
				$location.url('/');
				$rootScope.$apply();
				clUserSvc.signout();
				$rootScope.$apply();
			});

			return {
				restrict: 'E',
				templateUrl: 'optional/settingPage/settingPage.html',
				link: link
			};

			function link(scope) {
				var tabs = ['app', 'user', 'blogs', 'trash'];

				function serialize(obj) {
					return JSON.stringify(obj, function(key, value) {
						return key[0] === '$' ? undefined : value;
					});
				}

				function clone(obj) {
					return JSON.parse(serialize(obj));
				}

				var next;

				function resetUser() {
					scope.user = clone(clUserSvc.user);
				}

				function resetApp() {
					scope.app = clone(clSettingSvc.values);
				}

				scope.$watch('userSvc.user', resetUser);
				scope.$watch('settingSvc.values', resetApp);

				function reset() {
					resetUser();
					resetApp();
					next && next();
				}

				function apply() {
					try {
						clUserSvc.updateUser(scope.user);
					} catch (e) {
						scope.selectedTabIndex = tabs.indexOf('user');
						return clToast(e);
					}
					try {
						clSettingSvc.updateSettings(scope.app);
					} catch (e) {
						scope.selectedTabIndex = tabs.indexOf('app');
						return clToast(e);
					}
					next && next();
				}

				function checkModifications(tabIndex) {
					if (tabs[tabIndex] === 'app') {
						if (serialize(scope.app) !== serialize(clSettingSvc.values)) {
							return clDialog.show(clDialog.confirm()
									.title('App settings')
									.content('You\'ve modified your app settings.')
									.ok('Apply')
									.cancel('Ignore'))
								.then(apply, reset);
						}
					}
					if (tabs[tabIndex] === 'user') {
						if (serialize(scope.user) !== serialize(clUserSvc.user)) {
							return clDialog.show(clDialog.confirm()
									.title('User settings')
									.content('You\'ve modified your user settings.')
									.ok('Apply')
									.cancel('Ignore'))
								.then(apply, reset);
						}
					}
				}

				scope.loadDefault = function() {
					scope.app = clone(clSettingSvc.defaultValues);
				};

				scope.cancel = function() {
					next = function() {
						$location.url('/');
					};
					reset();
				};

				scope.apply = function() {
					next = function() {
						$location.url('/');
					};
					apply();
				};

				scope.editFileProperties = function() {
					clFilePropertiesDialog(scope.app.defaultFileProperties)
						.then(function(properties) {
							scope.app.defaultFileProperties = properties;
						});
				};

				scope.manageTemplates = function() {
					clTemplateManagerDialog(scope.app.exportTemplates)
						.then(function(templates) {
							scope.app.exportTemplates = templates;
						});
				};

				scope.signout = function() {
					$location.url('/');
					$timeout(clUserSvc.signout);
				};


				/***
				User
				***/

				(function() {

					scope.deleteUser = function() {
						clDialog.show(clDialog.confirm()
								.title('Remove account')
								.content('You\'re about to sign out. Your data will be removed within 7 days. Just sign in again if you change your mind.')
								.ok('Ok')
								.cancel('Cancel'))
							.then(function() {
								clSocketSvc.sendMsg({
									type: 'deleteUser'
								});
							});
					};

					var unwatchSocket = clStateMgr.state && scope.$watch('socketSvc.isReady', function(isReady) {
						if (isReady) {
							unwatchSocket();
							if (clStateMgr.state) {
								var newUserToken = clStateMgr.state.$search.newUserToken;
								if (clStateMgr.state.$search.userToken) {
									clToast('Account is already in use.');
								} else if (newUserToken) {
									clSocketSvc.sendMsg({
										type: 'linkUser',
										token: newUserToken
									});
								}
							}
						}
					});

					scope.getApiKey = function() {
						if (!scope.getApiKeyPending) {
							scope.getApiKeyPending = scope.$watch('socketSvc.isReady', function() {
								clSocketSvc.sendMsg({
									type: 'getUserApiKey'
								});
							});
						}
					};

					scope.renewApiKey = function() {
						clDialog.show(clDialog.confirm()
								.title('Renew API key')
								.content('You\'re about to renew your user API key. The current key won\'t work anymore.')
								.ok('Ok')
								.cancel('Cancel'))
							.then(function() {
								if (!scope.getApiKeyPending) {
									scope.getApiKeyPending = scope.$watch('socketSvc.isReady', function() {
										clSocketSvc.sendMsg({
											type: 'renewUserApiKey'
										});
									});
								}
							});
					};

					function apiKeyHandler(msg) {
						if (scope.getApiKeyPending) {
							scope.apiKey = msg.apiKey;
							scope.getApiKeyPending();
							scope.getApiKeyPending = undefined;
							scope.$evalAsync();
						}
					}

					clSocketSvc.addMsgHandler('userApiKey', apiKeyHandler);
					scope.$on('$destroy', function() {
						clSocketSvc.removeMsgHandler('userApiKey', apiKeyHandler);
					});

				})();


				/****
				Blogs
				****/

				(function() {

					scope.editBlog = function(blog) {
						clDialog.show({
								templateUrl: 'optional/settingPage/editBlogDialog.html',
								controller: ['$scope', function(scope) {
									scope.blog = blog;
									scope.form = ({}).cl_extend(blog);
								}],
								onComplete: function(scope) {
									scope.ok = function() {
										var newBlog = clBlogSvc.createBlog(scope.form);
										if (newBlog) {
											if (blog) {
												newBlog.id = blog.id;
												clSocketSvc.sendMsg({
													type: 'updateBlog',
													blog: newBlog
												});
											} else {
												clSocketSvc.sendMsg({
													type: 'createBlog',
													blog: newBlog
												});
											}
											clDialog.hide();
										}
									};
									scope.cancel = function() {
										clDialog.cancel();
									};
								}
							})
							.then(function() {
								scope.getBlogsPending = true;
							});
					};

					scope.deleteBlog = function(blog) {
						clDialog.show(clDialog.confirm()
								.title('Delete Blog')
								.content('You\'re about to remove a blog and all its associated blog posts. Blog posts won\'t be removed from your actual websites.')
								.ok('Ok')
								.cancel('Cancel'))
							.then(function() {
								scope.blogs = scope.blogs.cl_filter(function(remainingBlog) {
									return remainingBlog.id !== blog.id;
								});
								var unwatch = scope.$watch('socketSvc.isReady', function(value) {
									value && unwatch();
									clSocketSvc.sendMsg({
										type: 'deleteBlog',
										id: blog.id
									});
								});
							});
					};

					scope.getBlogs = function() {
						if (!scope.getBlogsPending) {
							scope.getBlogsPending = scope.$watch('socketSvc.isReady', function() {
								clSocketSvc.sendMsg({
									type: 'getBlogs'
								});
							});
						}
					};

					function blogsHandler(msg) {
						if (scope.getBlogsPending) {
							scope.blogs = msg.blogs;
							scope.getBlogsPending();
							scope.getBlogsPending = undefined;
							scope.$evalAsync();
						}
					}

					clSocketSvc.addMsgHandler('blogs', blogsHandler);
					scope.$on('$destroy', function() {
						clSocketSvc.removeMsgHandler('blogs', blogsHandler);
					});

				})();


				/****
				Trash
				****/

				(function() {

					scope.getTrashFiles = function(reset) {
						if (!scope.getTrashFilesPending) {
							if (reset) {
								scope.trashFiles = clFileSvc.deletedFileMap;
								scope.trashEmpty = clFileSvc.deletedFiles.length === 0;
								scope.lastDeleted = undefined;
							}
							scope.getTrashFilesPending = scope.$watch('socketSvc.isReady', function() {
								clSocketSvc.sendMsg({
									type: 'getTrashFiles',
									lastDeleted: scope.lastDeleted
								});
							});
						}
					};

					scope.recoverFile = function(file) {
						clSyncSvc.recoverFile(file);
						clToast('File recovery is pending...');
					};

					scope.removeFile = function(file) {
						clDialog.show(clDialog.confirm()
								.title('Remove from trash')
								.content('The file will be removed permanently. Are you sure?')
								.ok('Yes')
								.cancel('No'))
							.then(function() {
								clSocketSvc.sendMsg({
									type: 'deleteFile',
									id: file.id
								});
								scope.trashFiles = scope.trashFiles.cl_reduce(function(trashFiles, trashFile, id) {
									if (id !== file.id) {
										trashFiles[file.id] = trashFile;
									}
									return trashFiles;
								}, {});
							});
					};

					function trashFilesHandler(msg) {
						if (scope.getTrashFilesPending) {
							msg.files.cl_each(function(item) {
								scope.trashFiles[item.id] = item;
								scope.lastDeleted = item.deleted;
								scope.trashEmpty = false;
							});
							scope.lastDeleted = msg.hasMore && scope.lastDeleted;
							scope.getTrashFilesPending();
							scope.getTrashFilesPending = undefined;
							scope.$evalAsync();
						}
					}

					clSocketSvc.addMsgHandler('trashFiles', trashFilesHandler);
					scope.$on('$destroy', function() {
						clSocketSvc.removeMsgHandler('trashFiles', trashFilesHandler);
					});

				})();


				scope.$watch('selectedTabIndex', function(newIndex, oldIndex) {
					next = undefined;
					oldIndex !== undefined && checkModifications(oldIndex);
					var tab = tabs[newIndex];
					if (tab === 'trash') {
						scope.getTrashFiles(true);
					} else if (tab === 'blogs') {
						scope.getBlogs();
					} else if (tab === 'user') {
						scope.getApiKey();
					}
					$location.search('tab', tab);
				});

				function applyLocationSearch() {
					scope.selectedTabIndex = tabs.indexOf($location.search().tab);
					scope.selectedTabIndex = scope.selectedTabIndex === -1 ? 0 : scope.selectedTabIndex;
				}
				scope.$on('$locationChangeSuccess', applyLocationSearch);
				applyLocationSearch();
			}
		});
