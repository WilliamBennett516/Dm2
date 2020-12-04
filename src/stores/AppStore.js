import { notification } from "antd";
import { flow, types } from "mobx-state-tree";
import * as DataStores from "./DataStores";
import { DynamicModel, registerModel } from "./DynamicModel";
import { CustomJSON } from "./types";
import { ViewsStore } from "./Views";

export const AppStore = types
  .model("AppStore", {
    mode: types.optional(
      types.enumeration(["explorer", "labelstream"]),
      "explorer"
    ),

    viewsStore: types.optional(ViewsStore, {
      views: [],
    }),

    project: types.optional(CustomJSON, {}),

    loading: types.optional(types.boolean, false),

    taskStore: types.optional(
      types.late(() => {
        return DynamicModel.get("tasksStore");
      }),
      {}
    ),

    annotationStore: types.optional(
      types.late(() => {
        return DynamicModel.get("annotationsStore");
      }),
      {}
    ),

    availableActions: types.optional(types.array(CustomJSON), []),

    serverError: types.map(CustomJSON),
  })
  .views((self) => ({
    get SDK() {
      return self._sdk;
    },

    get API() {
      return self.SDK.api;
    },

    get isLabeling() {
      return !!self.dataStore?.selected || self.isLabelStreamMode;
    },

    get isLabelStreamMode() {
      return self.mode === "labelstream";
    },

    get isExplorerMode() {
      return self.mode === "explorer";
    },

    get currentView() {
      return self.viewsStore.selected;
    },

    get dataStore() {
      switch (self.target) {
        case "tasks":
          return self.taskStore;
        case "annotations":
          return self.annotationStore;
        default:
          return null;
      }
    },

    get target() {
      return self.viewsStore.selected?.target ?? "tasks";
    },
  }))
  .actions((self) => ({
    setMode(mode) {
      self.mode = mode;
    },

    unsetTask() {
      self.annotationStore.unset();
      self.taskStore.unset();
    },

    unsetSelection() {
      self.annotationStore.unset({ withHightlight: true });
      self.taskStore.unset({ withHightlight: true });
    },

    createDataStores() {
      const grouppedColumns = self.viewsStore.columns.reduce((res, column) => {
        res.set(column.target, res.get(column.target) ?? []);
        res.get(column.target).push(column);
        return res;
      }, new Map());

      grouppedColumns.forEach((columns, target) => {
        console.log({ target, columns });
        const dataStore = DataStores[target].create?.(columns);
        if (dataStore) registerModel(`${target}Store`, dataStore);
      });
    },

    fetchProject: flow(function* () {
      self.project = yield self.apiCall("project");
    }),

    fetchActions: flow(function* () {
      self.availableActions = yield self.apiCall("actions");
    }),

    fetchData: flow(function* () {
      self.loading = true;

      yield self.fetchProject();
      yield self.fetchActions();
      self.viewsStore.fetchColumns();
      // self.createDataStores();
      yield self.viewsStore.fetchViews();

      self.loading = false;
    }),

    apiCall: flow(function* (methodName, params, body) {
      let result = yield self.API[methodName](params, body);

      if (result.error) {
        if (result.response) {
          self.serverError.set(methodName, {
            error: "Something went wrong",
            response: result.response,
          });
        }

        notification.error({
          message: "Error occurred when loading data",
          description: result?.response?.detail ?? result.error,
        });
      } else {
        self.serverError.delete(methodName);
      }

      return result;
    }),
  }));
